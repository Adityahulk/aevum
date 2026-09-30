package com.aevum;

import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.*;
import org.springframework.http.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class ClinicianController {
  final Store store;
  final Auth auth;
  final TwinService twins;

  ClinicianController(Store store, Auth auth, TwinService twins) {
    this.store = store;
    this.auth = auth;
    this.twins = twins;
  }

  @PostMapping("/clinician-requests")
  @Transactional
  Map<String, Object> request(@RequestBody Map<String, Object> body, HttpServletRequest r) {
    String person = Api.person(r);
    auth.require(person, "health");
    // The account row serializes requests, including across API replicas.
    var accounts = store.db.queryForList("SELECT id FROM accounts WHERE person_id=? FOR UPDATE", person);
    if (accounts.isEmpty()) throw new Api.Failure(403, "Create your own account to request a call.");
    var existing = store.latest(person, "clinician_request");
    if (Set.of("requested", "contacted", "scheduled").contains(Api.str(existing, "status", ""))) return existing;
    if (!Boolean.TRUE.equals(body.get("share_report")))
      throw new Api.Failure(422, "Confirm sharing your report for this call.");
    String origin = Api.str(body, "origin", "twin");
    if (!Set.of("home", "twin").contains(origin)) throw new Api.Failure(422, "Invalid request source.");
    var saved = store.add(person, "clinician_request", Map.of(
        "status", "requested", "origin", origin, "share_report", true,
        "sharing_notice", "Aevum can prepare and share my health report with the clinician for this call."));
    store.audit(person, "ClinicianCallRequested", saved.get("id").toString());
    return saved;
  }

  @GetMapping("/admin/clinician-requests")
  List<Map<String, Object>> requests(HttpServletRequest r) {
    requireAdmin(r);
    return store.db.query(
        "SELECT r.person_id,r.payload,a.email FROM records r JOIN accounts a ON a.person_id=r.person_id WHERE r.kind='clinician_request' ORDER BY r.created_at DESC,r.id",
        (rs, n) -> {
          var result = store.decode(rs.getString("payload"));
          String person = rs.getString("person_id");
          result.put("name", store.latest(person, "profile").getOrDefault("name", "Member"));
          result.put("email", rs.getString("email"));
          result.put("report_available", auth.consent(person, "health"));
          return result;
        });
  }

  @PostMapping("/admin/clinician-requests/{id}")
  Map<String, Object> update(@PathVariable String id, @RequestBody Map<String, Object> body, HttpServletRequest r) {
    requireAdmin(r);
    String status = Api.str(body, "status", "");
    if (!Set.of("requested", "contacted", "scheduled", "completed", "cancelled").contains(status))
      throw new Api.Failure(422, "Choose a valid request status.");
    String person = owner(id);
    var request = store.get(person, "clinician_request", id);
    request.put("status", status);
    request.put("updated_at", Instant.now().toString());
    var saved = store.replace(person, "clinician_request", id, request);
    store.audit(person, "ClinicianRequestUpdated", id);
    return saved;
  }

  @GetMapping("/admin/clinician-requests/{id}/report")
  ResponseEntity<String> report(@PathVariable String id, HttpServletRequest r) {
    requireAdmin(r);
    String person = owner(id);
    auth.require(person, "health");
    var request = store.get(person, "clinician_request", id);
    if (!Boolean.TRUE.equals(request.get("share_report")) || "cancelled".equals(request.get("status")))
      throw new Api.Failure(403, "This request is not available for report sharing.");
    var context = twins.payload(person);
    var profile = Api.map(context.get("profile"));
    var observations = Api.maps(context.get("observations"));
    var twin = twins.current(person);
    var archives = store.list(person, "historical_import");
    var artifacts = store.list(person, "artifact").stream()
        .filter(a -> !"genomics".equals(a.get("kind")) || auth.consent(person, "genomics"))
        .filter(a -> !isWearableArtifact(a) || auth.consent(person, "wearable")).toList();
    long labs = observations.stream().filter(o -> !Wearables.isWearable(o.get("source"))).count();
    long wearables = observations.stream().filter(o -> Wearables.isWearable(o.get("source"))).count();
    String name = Api.str(profile, "name", "Member"), prepared = Instant.now().toString();
    StringBuilder h = new StringBuilder("<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Clinician review · ")
        .append(escape(name)).append("</title><style>").append(STYLE).append("</style></head><body>");
    h.append("<header class=\"cover\"><div class=\"brand\">AEVUM <span>PERSONAL BIOLOGY</span></div><p class=\"kicker\">CONFIDENTIAL · PREPARED FOR CLINICIAN REVIEW</p><h1>Clinical review<br><em>for ").append(escape(name)).append("</em></h1><p class=\"cover-meta\">Prepared ").append(escape(prepared)).append("</p><div class=\"cover-note\">Reported context, dated source results and Aevum’s current interpretation, organized for a focused discussion.</div></header>");
    h.append("<nav class=\"contents\"><a href=\"#overview\">Overview</a><a href=\"#context\">Lifestyle & history</a><a href=\"#measurements\">Measurements</a><a href=\"#twin\">Biological Twin</a><a href=\"#experiments\">Progress</a><a href=\"#sources\">Sources</a></nav><main>");
    sectionStart(h,"overview","01 · AT A GLANCE","Review summary","Current data snapshot");
    h.append("<div class=\"stats\">").append(stat("Verified measurements",observations.size(),"Dated results available"))
        .append(stat("Lab results",labs,"Individual source observations"))
        .append(stat("Wearable records",wearables,auth.consent(person,"wearable")?"Sharing enabled":"Sharing not enabled"))
        .append(stat("Twin domains",Api.maps(twin.get("domains")).size(),"Coverage varies by domain")).append("</div>");
    h.append("<div class=\"grid\"><article class=\"panel\"><span class=\"eyebrow\">MEMBER GOALS</span><h3>").append(escape(human(profile.getOrDefault("goal","Not recorded in Aevum")))).append("</h3>");
    if(present(profile.get("secondary_goal"))) h.append("<p>Also: ").append(escape(human(profile.get("secondary_goal")))).append("</p>");
    h.append("</article><article class=\"panel\"><span class=\"eyebrow\">LATEST RESULT</span><h3>").append(escape(latestDate(observations))).append("</h3><p>Twin ").append(escape(twin.getOrDefault("version","—"))).append(" · ").append(escape(twin.getOrDefault("model_version","Model not recorded"))).append("</p></article></div><p class=\"note\"><b>How to read this:</b> source measurements are shown as recorded. Model interpretations and evidence links are separate. Missing data is not a normal result; observed change does not establish cause.</p></section>");

    sectionStart(h,"context","02 · REPORTED BY MEMBER","Lifestyle & health history","Self-reported context");
    h.append("<h3 class=\"subhead\">Current profile</h3>").append(profileFields(profile));
    var oldFacts=store.list(person,"lifestyle_fact").stream().filter(f->!Objects.equals(f.get("context_version"),profile.get("id"))).toList();
    h.append(historicalFacts(oldFacts,archives));
    h.append(historicalReviews(archives));
    h.append("<h3 class=\"subhead\">Family history</h3>").append(family(profile,store.list(person,"family_history"),archives));
    h.append("<h3 class=\"subhead\">Medical history</h3>").append(medical(profile)).append("</section>");

    sectionStart(h,"measurements","03 · SOURCE RESULTS","Measurements over time","Source values · no synthetic normalization");
    h.append(charts(observations)).append(measurementTable(observations)).append("</section>");

    sectionStart(h,"twin","04 · AEVUM MODEL","Biological Twin","Interpretations · "+escape(twin.getOrDefault("model_version","version not recorded")));
    h.append(domains(Api.maps(twin.get("domains")))).append(relationships(Api.maps(twin.get("relationships"))))
        .append(genomics(Api.maps(context.get("genomic_findings")),Api.map(context.get("genomic_status")))).append("</section>");

    sectionStart(h,"experiments","05 · TRACKED OVER TIME","Experiments & follow-up","Member-reported progress");
    h.append(experiments(Api.maps(context.get("experiments")),store.list(person,"response"))).append("</section>");

    sectionStart(h,"sources","06 · PROVENANCE","Source documents","Original files remain private in Aevum");
    h.append(sources(artifacts,archives)).append("</section><footer><b>AEVUM · A CLEARER UNDERSTANDING</b><p>Point-in-time discussion report. It does not diagnose or replace clinical judgment. Check the original source when a result needs confirmation.</p><small>Generated ").append(escape(prepared)).append("</small></footer></main></body></html>");
    store.audit(person,"ClinicianReportDownloaded",id);
    return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=\"aevum-clinician-report-"+id+".html\"")
        .header("Content-Security-Policy","default-src 'none'; style-src 'unsafe-inline'; sandbox")
        .contentType(MediaType.TEXT_HTML).body(h.toString());
  }

  private void requireAdmin(HttpServletRequest r) {
    if (!auth.isAdmin(Api.person(r))) throw new Api.Failure(403, "Admin access required.");
  }

  private String owner(String id) {
    var people = store.db.query("SELECT person_id FROM records WHERE id=? AND kind='clinician_request'",
        (rs, n) -> rs.getString(1), id);
    if (people.isEmpty()) throw new Api.Failure(404, "Request not found.");
    return people.get(0);
  }

  private static final String STYLE="""
      :root{--ink:#263b34;--muted:#65746b;--green:#597a64;--line:#e0e8e1;--paper:#fff;--wash:#f4f7f3;--purple:#796687}*{box-sizing:border-box}body{margin:0;background:#f3f5f2;color:var(--ink);font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.cover{padding:38px max(28px,calc((100vw - 1080px)/2));min-height:340px;background:linear-gradient(128deg,#243a34,#456654 70%,#78917a);color:white}.brand{font-size:18px;font-weight:750;letter-spacing:.1em}.brand span{margin-left:10px;font-size:9px;letter-spacing:.18em;opacity:.72}.kicker,.eyebrow{font-size:10px;font-weight:700;letter-spacing:.15em;color:var(--green)}.cover .kicker{margin-top:54px;color:#d2e0d3}.cover h1{font:400 clamp(38px,6vw,58px)/1.03 Georgia,serif;margin:10px 0}.cover h1 em{color:#d8e5d7}.cover-meta,.cover-note{color:#e0e9e1;font-size:13px}.cover-note{max-width:620px;margin-top:20px}.contents{position:sticky;top:0;z-index:4;display:flex;gap:22px;overflow:auto;padding:14px max(28px,calc((100vw - 1080px)/2));background:white;border-bottom:1px solid var(--line);white-space:nowrap}.contents a{font-size:11px;font-weight:650;color:var(--muted);text-decoration:none}main{max-width:1080px;margin:auto;padding:0 28px 48px}.section{padding:38px 0;border-bottom:1px solid var(--line);scroll-margin-top:56px}.section-head{display:flex;align-items:end;justify-content:space-between;gap:12px;margin-bottom:20px}.section-head h2{font:600 27px/1.2 Georgia,serif;margin:6px 0 0}.tag{padding:6px 11px;border:1px solid var(--line);border-radius:30px;background:white;color:var(--muted);font-size:10px}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:11px}.stat,.panel,.domain,.relation,.experiment,.chart,.answer-group{padding:16px;border:1px solid var(--line);border-radius:14px;background:white}.stat span,.stat small{display:block;color:var(--muted);font-size:10px}.stat strong{display:block;font-size:25px;letter-spacing:-.04em}.grid,.domain-grid,.relation-grid,.experiment-grid,.source-grid,.chart-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:13px}.panel h3,.domain h3,.relation h3,.experiment h3,.chart h3{font-size:15px;margin:6px 0}.panel p,.domain p,.relation p,.experiment p{font-size:12px;color:var(--muted);margin:5px 0}.note{margin-top:15px;padding:13px 15px;border-left:3px solid #8da58e;border-radius:0 10px 10px 0;background:#eaf0e8;color:#53655a;font-size:12px}.subhead{font-size:16px;margin:24px 0 8px}.field-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 22px;margin:0}.field-list div{padding:10px 0;border-bottom:1px solid var(--line)}.field-list dt{font-size:9px;color:var(--muted);letter-spacing:.09em;text-transform:uppercase}.field-list dd{margin:3px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}.empty{padding:15px;border:1px dashed #cfdacf;border-radius:12px;color:var(--muted);background:#fafbf9;font-size:12px}.answer-group{margin:12px 0}.answer-group header{display:flex;justify-content:space-between;gap:10px;margin-bottom:8px}.answer-group small,.source-state{font-size:10px;color:var(--muted)}.answer-list{display:grid;grid-template-columns:minmax(160px,1fr) 2fr;margin:0}.answer-list dt,.answer-list dd{margin:0;padding:8px 6px;border-top:1px solid var(--line)}.answer-list dt{font-size:11px;color:var(--muted)}.answer-list dd{white-space:pre-wrap;overflow-wrap:anywhere}.table-wrap{overflow:auto;border:1px solid var(--line);border-radius:12px;background:white}.measure-table{width:100%;border-collapse:collapse;font-size:11px}.measure-table th,.measure-table td{padding:9px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line);overflow-wrap:anywhere}.measure-table th{background:#edf2ec;color:#52645a;font-size:9px;text-transform:uppercase;letter-spacing:.08em}.measure-table small{font-size:9px;color:var(--muted)}.chart .meta{font-size:10px;color:var(--muted)}.chart svg{width:100%;height:auto;margin-top:8px}.axis{stroke:#e4ebe5}.line{fill:none;stroke:#65866d;stroke-width:2.5}.point{fill:white;stroke:#65866d;stroke-width:2}.axis-label{fill:#7b8980;font-size:9px}.domain .top{display:flex;justify-content:space-between;gap:8px}.state{height:max-content;padding:4px 9px;border-radius:20px;background:#edf3eb;color:#47664e;font-size:10px}.state.warn{background:#f6efe6;color:#896740}.relation{border-left:3px solid #9380a3}.relation .pathway{font:17px Georgia,serif}.relation small{font-size:10px;color:var(--muted)}footer{padding:26px 0;color:var(--muted);font-size:10px}footer b{color:var(--green);letter-spacing:.12em}footer p{max-width:750px}@media(max-width:680px){.cover{padding:26px 20px;min-height:310px}.cover .kicker{margin-top:42px}.contents{padding:12px 18px;gap:16px}main{padding:0 18px 30px}.section{padding:29px 0}.section-head{align-items:start;flex-direction:column}.stats{grid-template-columns:repeat(2,1fr)}.grid,.domain-grid,.relation-grid,.experiment-grid,.source-grid,.chart-grid,.field-list{grid-template-columns:1fr}.answer-list{grid-template-columns:1fr}.answer-list dd{padding-top:0}.measure-table{min-width:740px}}@media print{body{background:white;font-size:10pt;print-color-adjust:exact;-webkit-print-color-adjust:exact}.cover{padding:24px 34px;min-height:auto}.cover .kicker{margin-top:25px}.contents{position:static;flex-wrap:wrap;padding:10px 34px}main{max-width:none;padding:0 34px}.section{padding:22px 0}.stat,.panel,.domain,.relation,.experiment,.chart,.answer-group,.table-wrap{break-inside:avoid}.stats{grid-template-columns:repeat(4,1fr)}.grid,.domain-grid,.relation-grid,.experiment-grid,.source-grid,.chart-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.measure-table{font-size:8pt}.measure-table th,.measure-table td{padding:5px}}
      """;

  private static void sectionStart(StringBuilder h,String id,String eyebrow,String title,String tag){h.append("<section id=\"").append(id).append("\" class=\"section\"><div class=\"section-head\"><div><span class=\"eyebrow\">").append(eyebrow).append("</span><h2>").append(title).append("</h2></div><span class=\"tag\">").append(tag).append("</span></div>");}
  private static String stat(String label,Object n,String caption){return "<article class=\"stat\"><span>"+escape(label)+"</span><strong>"+escape(n)+"</strong><small>"+escape(caption)+"</small></article>";}
  private static boolean present(Object o){return o!=null&&!(o instanceof String s&&s.isBlank())&&!(o instanceof Collection<?> c&&c.isEmpty())&&!(o instanceof Map<?,?> m&&m.isEmpty());}
  private static String human(Object o){if(o==null)return "Not recorded";if(o instanceof Boolean b)return b?"Yes":"No";if(o instanceof Collection<?> c)return c.stream().map(ClinicianController::human).collect(java.util.stream.Collectors.joining(", "));String v=String.valueOf(o).replace('_',' ').replace('-',' ').trim();if(v.matches("[a-z0-9 ]+")){var w=new ArrayList<String>();for(String x:v.split("\\s+"))w.add(x.isEmpty()?x:x.substring(0,1).toUpperCase(Locale.ROOT)+x.substring(1));return String.join(" ",w);}return v;}
  private static String missing(Object o){return present(o)?human(o):"Not recorded in Aevum";}
  private static String field(String label,Object value){return "<div><dt>"+escape(label)+"</dt><dd>"+escape(missing(value))+"</dd></div>";}
  private static String profileFields(Map<String,Object> p){StringBuilder x=new StringBuilder("<dl class=\"field-list\">");String[][] fields={{"Age","age"},{"Sex","sex"},{"Primary goal","goal"},{"Additional goal","secondary_goal"},{"Exercise frequency","exercise_frequency"},{"Exercise type","exercise_type"},{"Typical sleep duration","sleep_duration"},{"Sleep schedule","sleep_schedule"},{"Diet and eating pattern","diet"},{"Alcohol","alcohol"},{"Smoking","smoking"},{"Supplements","supplements"},{"Stress","stress"},{"Occupation","occupation"},{"Environmental exposures","exposures"}};for(var f:fields)x.append(field(f[0],p.get(f[1])));return x.append("</dl>").toString();}
  private static String family(Map<String,Object> profile, List<Map<String,Object>> saved,
      List<Map<String,Object>> archives) {
    var current = Api.maps(profile.get("family_history"));
    var records = current.isEmpty() ? saved : current;
    boolean hasImported = archives.stream().filter(a -> "confirmed".equals(a.get("status")))
        .map(a -> Api.maps(Api.map(a.get("lifestyle")).get("facts"))).flatMap(Collection::stream)
        .anyMatch(f -> Api.str(f, "source_pointer", "").toLowerCase(Locale.ROOT).contains("family"));
    StringBuilder html = new StringBuilder();
    if (records.isEmpty() && !hasImported)
      html.append("<div class=\"empty\"><b>No family history recorded in Aevum.</b><br>This may mean none was reported or that the member has not completed this part of their profile.</div>");
    if (!records.isEmpty()) {
      html.append("<div class=\"grid\">");
      for (var item : records) {
        html.append("<article class=\"panel\"><span class=\"eyebrow\">REPORTED FAMILY HISTORY</span><h3>")
            .append(escape(human(item.getOrDefault("relation", "Relative not recorded"))))
            .append(" · ").append(escape(human(item.getOrDefault("condition", "Condition not recorded"))))
            .append("</h3><p>Onset age: ").append(escape(missing(item.get("onset_age"))));
        if (present(item.get("age_at_death")))
          html.append(" · Age at death: ").append(escape(human(item.get("age_at_death"))));
        html.append("</p></article>");
      }
      html.append("</div>");
    }
    for (var archive : archives) {
      if (!"confirmed".equals(archive.get("status"))) continue;
      var lifestyle = Api.map(archive.get("lifestyle"));
      var facts = Api.maps(lifestyle.get("facts")).stream()
          .filter(f -> Api.str(f, "source_pointer", "").toLowerCase(Locale.ROOT).contains("family")).toList();
      if (facts.isEmpty()) continue;
      html.append("<article class=\"answer-group\"><header><b>Family history in imported questionnaire</b><small>")
          .append(escape(lifestyle.getOrDefault("collected_at", "Date not recorded"))).append("</small></header>")
          .append(answers(facts)).append("<p class=\"source-state\">Historical self-report. Details have not been converted into the member’s current structured family-history profile.</p></article>");
    }
    return html.toString();
  }
  private static String medical(Map<String,Object> p){StringBuilder x=new StringBuilder("<dl class=\"field-list\">");String[][] f={{"Conditions","conditions"},{"Medications","medications"},{"Allergies","allergies"},{"Symptoms","symptoms"},{"Procedures","procedures"}};for(var v:f)x.append(field(v[0],p.get(v[1])));return x.append("</dl>").toString();}
  private static String historicalFacts(List<Map<String,Object>> old,List<Map<String,Object>> archives){StringBuilder x=new StringBuilder();if(!old.isEmpty()){x.append("<h3 class=\"subhead\">Previously saved lifestyle answers</h3><dl class=\"field-list\">");for(var f:old)x.append(field(human(f.getOrDefault("concept","Reported answer")),f.get("value")));x.append("</dl>");}boolean found=false;for(var a:archives){if(!"confirmed".equals(a.get("status")))continue;var l=Api.map(a.get("lifestyle"));var allFacts=Api.maps(l.get("facts"));if(allFacts.isEmpty())continue;found=true;var facts=allFacts.stream().filter(f->!Api.str(f,"source_pointer","").toLowerCase(Locale.ROOT).contains("family")).toList();if(facts.isEmpty())continue;x.append("<article class=\"answer-group\"><header><b>Historical lifestyle questionnaire</b><small>").append(escape(l.getOrDefault("collected_at","Date not recorded"))).append(present(l.get("source_file"))?" · "+escape(l.get("source_file")):"").append("</small></header>").append(answers(facts)).append("</article>");}if(!found&&old.isEmpty())x.append("<h3 class=\"subhead\">Imported questionnaire</h3><div class=\"empty\">No confirmed imported lifestyle questionnaire answers are available.</div>");return x.toString();}
  private static String historicalReviews(List<Map<String,Object>> archives) {
    StringBuilder html = new StringBuilder();
    for (var archive : archives) {
      if (!"confirmed".equals(archive.get("status"))) continue;
      var review = Api.map(archive.get("fresh_review"));
      if (review.isEmpty()) continue;
      html.append("<article class=\"answer-group\"><header><b>Notes supplied with historical report</b><small>Unverified imported text</small></header>");
      if (present(review.get("headline"))) html.append("<h3>").append(escape(review.get("headline"))).append("</h3>");
      if (present(review.get("context"))) html.append("<p>").append(escape(review.get("context"))).append("</p>");
      for (var finding : Api.maps(review.get("findings"))) {
        html.append("<h4>").append(escape(finding.getOrDefault("title", "Imported note"))).append("</h4>");
        appendNote(html, "Reported", finding.get("observed"));
        appendNote(html, "Interpretation in source", finding.get("interpretation"));
        appendNote(html, "Suggested next step in source", finding.get("next_step"));
      }
      html.append("<p class=\"source-state\">Supplied with the historical file; not verified or authored by Aevum.</p></article>");
    }
    return html.toString();
  }

  private static void appendNote(StringBuilder html, String label, Object value) {
    if (present(value)) html.append("<p><b>").append(label).append(":</b> ").append(escape(value)).append("</p>");
  }

  private static String answers(List<Map<String,Object>> facts){Map<String,List<Map<String,Object>>> groups=new LinkedHashMap<>();for(var f:facts){String pointer=Api.str(f,"source_pointer","").replaceFirst("/\\d+$","");groups.computeIfAbsent(pointer.isBlank()?"/reported_answer":pointer,k->new ArrayList<>()).add(f);}StringBuilder x=new StringBuilder("<dl class=\"answer-list\">");for(var e:groups.entrySet()){var f=e.getValue().get(0);String label=Api.str(f,"label","");if(label.isBlank())label=Api.str(f,"question","");if(label.isBlank())label=pointerLabel(e.getKey());var values=e.getValue().stream().map(v->v.get("value")).toList();x.append("<dt>").append(escape(label)).append("</dt><dd>").append(escape(human(values.size()==1?values.get(0):values))).append("</dd>");}return x.append("</dl>").toString();}
  private static String pointerLabel(String pointer){String p=pointer.toLowerCase(Locale.ROOT);if(p.contains("family"))return "Family history";Map<String,String> labels=Map.ofEntries(Map.entry("/identity/primary_goal","Primary goal"),Map.entry("/identity/secondary_goal","Additional goal"),Map.entry("/identity/age","Age"),Map.entry("/identity/sex","Sex"),Map.entry("/sleep_recovery/total_sleep_hours_estimated","Typical sleep duration"),Map.entry("/sleep_recovery/sleep_schedule","Sleep schedule"),Map.entry("/body_medical/weight_kg","Body weight"),Map.entry("/body_medical/height_cm","Height"),Map.entry("/body_medical/known_conditions","Known conditions"),Map.entry("/body_medical/medications","Medications"),Map.entry("/body_medical/allergies","Allergies"),Map.entry("/body_medical/family_history","Family history"),Map.entry("/activity/exercise_frequency","Exercise frequency"),Map.entry("/activity/exercise_type","Exercise type"),Map.entry("/nutrition/diet","Diet and eating pattern"),Map.entry("/nutrition/alcohol","Alcohol"),Map.entry("/nutrition/smoking","Smoking"),Map.entry("/nutrition/supplements","Supplements"),Map.entry("/stress/stress","Stress"));if(labels.containsKey(p))return labels.get(p);return human(p.substring(p.lastIndexOf('/')+1));}
  private static String latestDate(List<Map<String,Object>> rows){return rows.stream().map(o->Api.str(o,"effective_time","")).filter(v->!v.isBlank()).max(String::compareTo).map(v->escape(v.length()>10?v.substring(0,10):v)).orElse("Not recorded");}
  private static boolean isWearableArtifact(Map<String,Object>a){String k=Api.str(a,"kind","").toLowerCase(Locale.ROOT);return k.contains("wearable")||k.equals("oura")||k.equals("health");}
  private static String measurementTable(List<Map<String,Object>> rows){if(rows.isEmpty())return "<div class=\"empty\">No verified measurements are available.</div>";var sorted=new ArrayList<>(rows);sorted.sort(Comparator.comparing(o->Api.str(o,"effective_time","")));StringBuilder x=new StringBuilder("<div class=\"table-wrap\"><table class=\"measure-table\"><thead><tr><th>Measurement</th><th>Date</th><th>Result</th><th>Source interval</th><th>Source & verification</th></tr></thead><tbody>");for(var o:sorted){var ref=Api.map(o.get("reference_range"));String range=present(ref.get("low"))||present(ref.get("high"))?String.valueOf(ref.getOrDefault("low","—"))+" to "+String.valueOf(ref.getOrDefault("high","—")):"Not supplied";x.append("<tr><td><b>").append(escape(o.getOrDefault("label",human(o.get("concept_id"))))).append("</b><br><small>").append(escape(o.getOrDefault("concept_id",""))).append("</small></td><td>").append(escape(o.getOrDefault("effective_time","Not recorded"))).append("</td><td>").append(escape(o.getOrDefault("value","Not recorded"))).append(" ").append(escape(o.getOrDefault("unit",""))).append("</td><td>").append(escape(range));if(present(ref.get("origin")))x.append("<br><small>").append(escape(ref.get("origin"))).append("</small>");x.append("</td><td>").append(escape(human(o.getOrDefault("source","Not recorded"))));if(present(o.get("quality_status")))x.append(" · ").append(escape(human(o.get("quality_status"))));if(present(o.get("provenance_id")))x.append("<br><small>Source record: ").append(escape(o.get("provenance_id"))).append("</small>");x.append("</td></tr>");}return x.append("</tbody></table></div>").toString();}
  private static String charts(List<Map<String,Object>> rows){Map<String,List<Map<String,Object>>> groups=new HashMap<>();for(var o:rows)if(o.get("value") instanceof Number){String code=Api.str(o,"concept_id","");groups.computeIfAbsent(code,k->new ArrayList<>()).add(o);}var picked=groups.entrySet().stream().filter(e->e.getValue().size()>1).sorted(Comparator.<Map.Entry<String,List<Map<String,Object>>>>comparingInt(e->e.getValue().size()).reversed()).limit(8).toList();if(picked.isEmpty())return "<div class=\"empty\">Trend charts appear after a measurement has multiple dated results. Available results are listed below.</div>";StringBuilder x=new StringBuilder("<div class=\"chart-grid\">");for(var e:picked){var points=e.getValue().stream().sorted(Comparator.comparing(o->Api.str(o,"effective_time",""))).toList();x.append(chart(Api.str(points.get(0),"label",e.getKey()),Api.str(points.get(0),"unit",""),points));}return x.append("</div>").toString();}
  private static String chart(String label,String unit,List<Map<String,Object>> points){int w=460,h=166,l=43,r=12,t=13,b=28;double min=points.stream().mapToDouble(o->((Number)o.get("value")).doubleValue()).min().orElse(0),max=points.stream().mapToDouble(o->((Number)o.get("value")).doubleValue()).max().orElse(1);if(max-min<1e-7){double d=Math.max(Math.abs(max)*.05,1);min-=d;max+=d;}StringBuilder line=new StringBuilder(),dots=new StringBuilder();for(int i=0;i<points.size();i++){var o=points.get(i);double x=l+(w-l-r)*(points.size()==1?.5:(double)i/(points.size()-1)),y=t+(h-t-b)*(max-((Number)o.get("value")).doubleValue())/(max-min);line.append(String.format(Locale.ROOT,"%.1f,%.1f ",x,y));if(points.size()<=22||i==0||i==points.size()-1||i%Math.max(1,points.size()/10)==0)dots.append("<circle class=\"point\" cx=\"").append(num(x)).append("\" cy=\"").append(num(y)).append("\" r=\"3\"><title>").append(escape(dateLabel(o.get("effective_time")))).append(" · ").append(escape(o.get("value"))).append(" ").append(escape(unit)).append("</title></circle>");}String first=escape(dateLabel(points.get(0).get("effective_time"))),last=escape(dateLabel(points.get(points.size()-1).get("effective_time")));return "<article class=\"chart\"><h3>"+escape(label)+"</h3><span class=\"meta\">"+escape(unit)+" · "+points.size()+" results</span><svg viewBox=\"0 0 "+w+" "+h+"\" role=\"img\" aria-label=\""+escape(label)+" over time, "+first+" to "+last+"\"><line class=\"axis\" x1=\""+l+"\" y1=\""+(h-b)+"\" x2=\""+(w-r)+"\" y2=\""+(h-b)+"\"/><text class=\"axis-label\" x=\"3\" y=\""+(t+4)+"\">"+num(max)+"</text><text class=\"axis-label\" x=\"3\" y=\""+(h-b)+"\">"+num(min)+"</text><polyline class=\"line\" points=\""+line+"\"/>"+dots+"<text class=\"axis-label\" x=\""+l+"\" y=\""+(h-5)+"\">"+first+"</text><text class=\"axis-label\" text-anchor=\"end\" x=\""+(w-r)+"\" y=\""+(h-5)+"\">"+last+"</text></svg></article>";}
  private static String num(double n){return String.format(Locale.ROOT,"%.2f",n).replaceAll("0+$","").replaceAll("\\.$","");}
  private static String dateLabel(Object o){if(o==null)return "Date unknown";String v=String.valueOf(o);return v.length()>10?v.substring(0,10):v;}
  private static String domains(List<Map<String,Object>> domains){if(domains.isEmpty())return "<div class=\"empty\">No Twin domains have been assessed.</div>";StringBuilder x=new StringBuilder("<div class=\"domain-grid\">");for(var d:domains){String state=human(d.getOrDefault("state","Not assessed"));boolean warn=state.toLowerCase(Locale.ROOT).contains("concern")||state.toLowerCase(Locale.ROOT).contains("insufficient");x.append("<article class=\"domain\"><div class=\"top\"><div><span class=\"eyebrow\">").append(escape(human(d.getOrDefault("id","")))).append("</span><h3>").append(escape(d.getOrDefault("name",human(d.get("id"))))).append("</h3></div><span class=\"state ").append(warn?"warn":"").append("\">").append(escape(state)).append("</span></div>");if(present(d.get("phenotype_explanation")))x.append("<p>").append(escape(d.get("phenotype_explanation"))).append("</p>");else if(present(d.get("uncertainty")))x.append("<p>").append(escape(d.get("uncertainty"))).append("</p>");x.append("<small class=\"source-state\">Coverage ").append(escape(d.getOrDefault("coverage",0))).append("% · ").append(escape(human(d.getOrDefault("confidence","Low")))).append(" confidence · ").append(Api.maps(d.get("signals")).size()).append(" direct measurements</small></article>");}return x.append("</div>").toString();}
  private static String relationships(List<Map<String,Object>> rows){if(rows.isEmpty())return "<h3 class=\"subhead\">Evidence-linked biology</h3><div class=\"empty\">No pathway relationship is supported by the current data.</div>";StringBuilder x=new StringBuilder("<h3 class=\"subhead\">Evidence-linked biology</h3><div class=\"relation-grid\">");for(var r:rows){x.append("<article class=\"relation\"><span class=\"eyebrow\">").append(escape(human(r.getOrDefault("domain_id","Biology")))).append("</span><h3>").append(escape(r.getOrDefault("pathway",r.getOrDefault("process","Process not named")))).append("</h3>");if(present(r.get("phenotype")))x.append("<p><b>Linked observation:</b> ").append(escape(r.get("phenotype"))).append("</p>");if(present(r.get("limitations")))x.append("<p>").append(escape(r.get("limitations"))).append("</p>");x.append("<small>").append(escape(human(r.getOrDefault("evidence_level","Evidence level not recorded")))).append(" · ").append(escape(human(r.getOrDefault("confidence","Confidence not recorded")))).append(" confidence</small></article>");}return x.append("</div>").toString();}
  private static String genomics(List<Map<String,Object>> findings,Map<String,Object> status){if(!Boolean.TRUE.equals(status.get("enabled")))return "<h3 class=\"subhead\">Genomic context</h3><div class=\"empty\">Genomic sharing is off; results are not included in this report.</div>";if(findings.isEmpty())return "<h3 class=\"subhead\">Genomic context</h3><div class=\"empty\">No supported genomic finding is available. This does not mean a complete genome review was performed.</div>";StringBuilder x=new StringBuilder("<h3 class=\"subhead\">Genomic context</h3><div class=\"grid\">");for(var f:findings)x.append("<article class=\"panel\"><h3>").append(escape(human(f.getOrDefault("gene","Finding")))).append(" · ").append(escape(human(f.getOrDefault("variant","")))).append("</h3><p>").append(escape(f.getOrDefault("interpretation","Interpretation not recorded"))).append("</p><small class=\"source-state\">").append(escape(human(f.getOrDefault("evidence","Evidence not recorded")))).append("</small></article>");return x.append("</div><small class=\"source-state\">Only the curated findings available in Aevum are shown.</small>").toString();}
  private static String experiments(List<Map<String,Object>> experiments,List<Map<String,Object>> responses){if(experiments.isEmpty()&&responses.isEmpty())return "<div class=\"empty\">No Aevum experiment has been started. This does not imply that the member made no changes outside Aevum.</div>";StringBuilder x=new StringBuilder("<div class=\"experiment-grid\">");for(var e:experiments){x.append("<article class=\"experiment\"><span class=\"eyebrow\">").append(escape(human(e.getOrDefault("category","Experiment")))).append(" · ").append(escape(human(e.getOrDefault("status","Status unknown")))).append("</span><h3>").append(escape(e.getOrDefault("name","Experiment"))).append("</h3><p>Started ").append(escape(e.getOrDefault("start_date","Date not recorded"))).append(" · ").append(escape(e.getOrDefault("planned_duration_weeks","—"))).append(" weeks · ").append(escape(e.getOrDefault("adherence","—"))).append("% adherence</p>");if(present(e.get("protocol")))x.append("<p>").append(escape(e.get("protocol"))).append("</p>");if(present(e.get("baseline")))x.append("<p><b>Frozen baseline:</b> ").append(escape(compact(e.get("baseline")))).append("</p>");for(var c:Api.maps(e.get("checkins")))x.append("<p>Check-in ").append(escape(dateLabel(c.get("date")))).append(" · ").append(escape(c.getOrDefault("adherence","—"))).append("% adherence").append(present(c.get("adverse_effects"))?" · "+escape(c.get("adverse_effects")):"").append("</p>");if(present(e.get("decision")))x.append("<p><b>Recorded outcome:</b> ").append(escape(e.get("decision"))).append("</p>");x.append("</article>");}for(var r:responses)x.append("<article class=\"experiment\"><h3>Follow-up assessment</h3><p>").append(escape(compact(r))).append("</p></article>");return x.append("</div><p class=\"note\">Observed changes do not prove that an intervention caused them.</p>").toString();}
  private static String sources(List<Map<String,Object>> artifacts,List<Map<String,Object>> archives){if(artifacts.isEmpty()&&archives.isEmpty())return "<div class=\"empty\">No source documents recorded.</div>";StringBuilder x=new StringBuilder("<div class=\"source-grid\">");for(var a:artifacts)x.append("<article class=\"panel\"><span class=\"eyebrow\">").append(escape(human(a.getOrDefault("kind","Source")))).append(" · ").append(escape(human(a.getOrDefault("status","Status unknown")))).append("</span><h3>").append(escape(a.getOrDefault("filename","Source document"))).append("</h3><p>Added ").append(escape(a.getOrDefault("created_at","Date not recorded"))).append("</p></article>");for(var a:archives)if(artifacts.stream().noneMatch(v->Objects.equals(v.get("id"),a.get("artifact_id"))))x.append("<article class=\"panel\"><span class=\"eyebrow\">HISTORICAL IMPORT · ").append(escape(human(a.getOrDefault("status","Status unknown")))).append("</span><h3>Historical health and lifestyle record</h3><p>").append(Api.maps(a.get("rows")).size()).append(" measurement rows · imported ").append(escape(a.getOrDefault("created_at","Date not recorded"))).append("</p></article>");return x.append("</div><p class=\"source-state\">Original uploaded files are not embedded. Use the source document index and the source references beside each value to locate them in Aevum.</p>").toString();}
  private static String compact(Object o){if(o instanceof Map<?,?> m)return m.entrySet().stream().map(e->human(e.getKey())+": "+human(e.getValue())).collect(java.util.stream.Collectors.joining(" · "));return human(o);}
  private static String escape(Object o){return String.valueOf(o).replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace("\"","&quot;").replace("'","&#39;");}
}
