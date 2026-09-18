package com.aevum;

import jakarta.servlet.http.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.context.annotation.Configuration;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.*;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.*;

@RestControllerAdvice
public class Api {
  public static class Failure extends RuntimeException {
    final int status;

    public Failure(int status, String message) {
      super(message);
      this.status = status;
    }
  }

  @ExceptionHandler(Failure.class)
  public ResponseEntity<?> fail(Failure e) {
    return ResponseEntity.status(e.status).body(Map.of("error", e.getMessage()));
  }

  @ExceptionHandler({
    IllegalArgumentException.class,
    org.springframework.http.converter.HttpMessageNotReadableException.class
  })
  public ResponseEntity<?> invalid(Exception e) {
    return ResponseEntity.badRequest()
        .body(Map.of("error", "Invalid request. Check the submitted fields."));
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<?> unexpected(Exception e) {
    System.err.println("Request failed: " + e.getClass().getSimpleName());
    return ResponseEntity.status(500)
        .body(Map.of("error", "The operation could not be completed. Please try again."));
  }

  static String hash(String s) {
    try {
      return HexFormat.of()
          .formatHex(
              MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  @SuppressWarnings("unchecked")
  static Map<String, Object> map(Object o) {
    return o instanceof Map ? (Map<String, Object>) o : new LinkedHashMap<>();
  }

  @SuppressWarnings("unchecked")
  static List<Map<String, Object>> maps(Object o) {
    return o instanceof List ? (List<Map<String, Object>>) o : new ArrayList<>();
  }

  static String str(Map<String, Object> m, String k, String d) {
    return String.valueOf(m.getOrDefault(k, d));
  }

  static String person(HttpServletRequest r) {
    Object p = r.getAttribute("person");
    if (p == null) throw new Failure(401, "Sign in to continue");
    return p.toString();
  }
}

@Component
class Auth {
  final Store store;
  final BCryptPasswordEncoder passwords = new BCryptPasswordEncoder(12);

  Auth(Store s) {
    store = s;
  }

  String authenticate(HttpServletRequest req) {
    Cookie[] cookies = req.getCookies();
    if (cookies == null) return null;
    for (Cookie c : cookies)
      if (c.getName().equals("aevum_session")) {
        var people =
            store.db.query(
                "SELECT person_id FROM sessions WHERE token_hash=? AND expires_at>?",
                (rs, n) -> rs.getString(1),
                Api.hash(c.getValue()),
                Instant.now().getEpochSecond());
        if (!people.isEmpty()) return people.get(0);
      }
    return null;
  }

  void session(String person, HttpServletResponse response) {
    byte[] bytes = new byte[32];
    new SecureRandom().nextBytes(bytes);
    String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    store.db.update(
        "INSERT INTO sessions(token_hash,person_id,expires_at) VALUES(?,?,?)",
        Api.hash(token),
        person,
        Instant.now().plusSeconds(86400 * 7).getEpochSecond());
    response.addHeader(
        "Set-Cookie",
        ResponseCookie.from("aevum_session", token)
            .httpOnly(true)
            .secure("production".equals(System.getenv("AEVUM_ENV")))
            .sameSite("Lax")
            .path("/")
            .maxAge(Duration.ofDays(7))
            .build()
            .toString());
  }

  boolean consent(String p, String scope) {
    List<Map<String, Object>> records = store.list(p, "consent");
    for (int i = records.size() - 1; i >= 0; i--) {
      Map<String, Object> c = records.get(i);
      if (scope.equals(c.get("scope"))) return Boolean.TRUE.equals(c.get("granted"));
    }
    return false;
  }

  void require(String p, String scope) {
    if (!consent(p, scope))
      throw new Api.Failure(403, "Enable " + scope + " consent in Privacy to use this feature.");
  }
}

@Configuration
class SecurityConfiguration implements WebMvcConfigurer {
  final Auth auth;
  final Map<String, List<Long>> attempts = new ConcurrentHashMap<>();

  SecurityConfiguration(Auth a) {
    auth = a;
  }

  @Override
  public void addInterceptors(InterceptorRegistry registry) {
    registry
        .addInterceptor(
            new HandlerInterceptor() {
              @Override
              public boolean preHandle(HttpServletRequest r, HttpServletResponse s, Object h) {
                s.setHeader("X-Content-Type-Options", "nosniff");
                s.setHeader("X-Frame-Options", "DENY");
                s.setHeader("Referrer-Policy", "same-origin");
                s.setHeader("Cache-Control", "no-store");
                if (!Set.of("GET", "HEAD", "OPTIONS").contains(r.getMethod())
                    && !"1".equals(r.getHeader("X-Aevum-Request")))
                  throw new Api.Failure(403, "Request verification failed");
                String fetch = r.getHeader("Sec-Fetch-Site");
                if ("cross-site".equals(fetch))
                  throw new Api.Failure(403, "Cross-site requests are not allowed");
                if (r.getRequestURI().startsWith("/api/auth/")) {
                  String key = r.getRemoteAddr();
                  long now = System.currentTimeMillis();
                  var list =
                      attempts.computeIfAbsent(
                          key, k -> Collections.synchronizedList(new ArrayList<>()));
                  synchronized (list) {
                    list.removeIf(t -> t < now - 60000);
                    if (list.size() >= 20)
                      throw new Api.Failure(429, "Too many attempts. Please wait a minute.");
                    list.add(now);
                  }
                  return true;
                }
                if (r.getRequestURI().equals("/api/health")) return true;
                if (r.getRequestURI().startsWith("/api/")) {
                  String person = auth.authenticate(r);
                  if (person == null) throw new Api.Failure(401, "Sign in to continue");
                  r.setAttribute("person", person);
                }
                return true;
              }
            })
        .addPathPatterns("/api/**");
  }
}

@RestController
@RequestMapping("/api")
class IdentityController {
  final Store store;
  final Auth auth;
  final TwinService twins;
  final DemoService demo;
  final RawStorage raw;
  final OpenWearables wearables;

  IdentityController(
      Store s, Auth a, TwinService t, DemoService d, RawStorage raw, OpenWearables wearables) {
    store = s;
    auth = a;
    twins = t;
    demo = d;
    this.raw = raw;
    this.wearables = wearables;
  }

  @GetMapping("/health")
  Map<String, Object> health() {
    return Map.of("status", "ok", "service", "aevum-api");
  }

  @PostMapping("/auth/register")
  synchronized Map<String, Object> register(
      @RequestBody Map<String, Object> b, HttpServletResponse response) {
    String email = Api.str(b, "email", "").trim().toLowerCase(Locale.ROOT),
        password = Api.str(b, "password", "");
    if (!email.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")
        || email.length() > 254
        || password.length() < 12
        || password.length() > 72)
      throw new Api.Failure(422, "Use a valid email and a password of 12–72 characters.");
    String p = Store.id();
    try {
      store.db.update(
          "INSERT INTO accounts(id,email,password_hash,person_id,created_at) VALUES(?,?,?,?,?)",
          Store.id(),
          email,
          auth.passwords.encode(password),
          p,
          Instant.now().toString());
    } catch (DuplicateKeyException e) {
      throw new Api.Failure(409, "An account already exists for this email. Sign in instead.");
    }
    store.add(
        p,
        "profile",
        Map.of(
            "name",
            Api.str(b, "name", "You"),
            "goal",
            "Longevity",
            "onboarded",
            false,
            "demo",
            false,
            "preferences",
            Map.of("supplements", false, "strong_only", false)));
    auth.session(p, response);
    store.audit(p, "AccountCreated", p);
    return Map.of("profile", store.latest(p, "profile"));
  }

  @PostMapping("/auth/login")
  Map<String, Object> login(@RequestBody Map<String, Object> b, HttpServletResponse response) {
    var rows =
        store.db.queryForList(
            "SELECT person_id,password_hash FROM accounts WHERE email=?",
            Api.str(b, "email", "").trim().toLowerCase(Locale.ROOT));
    String hash =
        rows.isEmpty()
            ? "$2a$12$4s5OgUB7b/ULyOXUBRkc5.bXEXJuEJueDm/Ygr8kCFmNlqPJHdTqO"
            : rows.get(0).get("password_hash").toString();
    boolean valid = auth.passwords.matches(Api.str(b, "password", ""), hash);
    if (rows.isEmpty() || !valid)
      throw new Api.Failure(401, "Email or password was not recognized.");
    String p = rows.get(0).get("person_id").toString();
    auth.session(p, response);
    store.audit(p, "SignedIn", p);
    return Map.of("profile", store.latest(p, "profile"));
  }

  @PostMapping("/auth/demo")
  Map<String, Object> demo(HttpServletResponse response) {
    String p = demo.create();
    auth.session(p, response);
    return Map.of("profile", store.latest(p, "profile"));
  }

  @PostMapping("/logout")
  Map<String, Object> logout(HttpServletRequest r, HttpServletResponse s) {
    String p = Api.person(r);
    store.db.update("DELETE FROM sessions WHERE person_id=?", p);
    s.addHeader(
        "Set-Cookie",
        ResponseCookie.from("aevum_session", "")
            .path("/")
            .maxAge(0)
            .httpOnly(true)
            .sameSite("Lax")
            .build()
            .toString());
    return Map.of("ok", true);
  }

  @GetMapping("/me")
  Map<String, Object> me(HttpServletRequest r) {
    String p = Api.person(r);
    Map<String, Object> consents = new LinkedHashMap<>();
    for (String scope : List.of("health", "wearable", "genomics", "ai", "clinician", "research"))
      consents.put(scope, auth.consent(p, scope));
    return Map.of("profile", store.latest(p, "profile"), "consents", consents);
  }

  @PostMapping("/consent")
  Map<String, Object> consent(@RequestBody Map<String, Object> b, HttpServletRequest r) {
    String p = Api.person(r), scope = Api.str(b, "scope", "");
    if (!List.of("health", "wearable", "genomics", "ai", "clinician", "research").contains(scope)
        || !(b.get("granted") instanceof Boolean))
      throw new Api.Failure(422, "Invalid consent scope or decision");
    synchronized (wearables) {
      if (Boolean.FALSE.equals(b.get("granted"))
          && (scope.equals("wearable") || scope.equals("health"))) wearables.purge(p);
      var c =
          store.add(
              p,
              "consent",
              Map.of("scope", scope, "granted", b.get("granted"), "policy_version", "2026-09-v1"));
      store.audit(p, "ConsentChanged", scope);
      if (Boolean.FALSE.equals(b.get("granted")) && scope.equals("wearable")) {
        store.db.update(
            "DELETE FROM records WHERE person_id=? AND (kind IN ('oura_token','oauth_state') OR"
                + " kind LIKE 'wearable:%')",
            p);
      }
      if (auth.consent(p, "health") && (scope.equals("wearable") || scope.equals("health")))
        twins.refresh(p, "Processing permissions updated", Set.of());
      return c;
    }
  }

  @org.springframework.transaction.annotation.Transactional
  @PostMapping("/profile")
  Map<String, Object> profile(@RequestBody Map<String, Object> b, HttpServletRequest r) {
    String p = Api.person(r);
    auth.require(p, "health");
    ProfileValidation.validate(b);
    if (b.containsKey("age")) {
      int age;
      try {
        age = Integer.parseInt(b.get("age").toString());
      } catch (Exception e) {
        throw new Api.Failure(422, "Enter your age in years");
      }
      if (age < 18 || age > 120)
        throw new Api.Failure(422, "This MVP supports adults aged 18–120.");
      b.put("age", age);
    }
    Map<String, Object> profile = new LinkedHashMap<>(store.latest(p, "profile"));
    Set<String> allowed =
        Set.of(
            "name",
            "age",
            "sex",
            "goal",
            "secondary_goal",
            "conditions",
            "medications",
            "allergies",
            "symptoms",
            "procedures",
            "family_history",
            "exercise_frequency",
            "exercise_type",
            "sleep_duration",
            "sleep_schedule",
            "diet",
            "alcohol",
            "smoking",
            "supplements",
            "stress",
            "occupation",
            "exposures",
            "preferences",
            "onboarded");
    for (var e : b.entrySet())
      if (allowed.contains(e.getKey())) profile.put(e.getKey(), e.getValue());
    profile.remove("id");
    profile.remove("created_at");
    profile.put("effective_from", Instant.now().toString());
    var savedProfile = store.add(p, "profile", profile);
    ProfileValidation.facts(store, p, savedProfile);
    store.audit(p, "ContextUpdated", p);
    twins.refresh(p, "Context updated", Set.of());
    return store.latest(p, "profile");
  }

  @GetMapping("/audit")
  List<Map<String, Object>> audit(HttpServletRequest r) {
    return store.list(Api.person(r), "audit");
  }

  @GetMapping("/export")
  Map<String, Object> export(HttpServletRequest r) {
    String p = Api.person(r);
    store.audit(p, "DataExported", p);
    Map<String, Object> out = new LinkedHashMap<>();
    for (String kind :
        List.of(
            "profile",
            "lifestyle_fact",
            "family_history",
            "medical_context",
            "consent",
            "observation",
            "artifact",
            "genomic_finding",
            "variant",
            "experiment",
            "response",
            "twin",
            "audit",
            "claim")) out.put(kind, store.list(p, kind));
    return out;
  }

  @DeleteMapping("/account")
  synchronized Map<String, Object> delete(
      @RequestBody Map<String, Object> b, HttpServletRequest r, HttpServletResponse response) {
    String p = Api.person(r);
    if (!"DELETE".equals(b.get("confirmation")))
      throw new Api.Failure(422, "Type DELETE to confirm account deletion.");
    synchronized (wearables) {
      wearables.purge(p);
      for (var a : store.list(p, "artifact")) raw.delete(a.get("storage_key").toString());
      store.db.update("DELETE FROM observation_index WHERE person_id=?", p);
      store.db.update("DELETE FROM records WHERE person_id=?", p);
      store.db.update("DELETE FROM events WHERE person_id=?", p);
      store.db.update("DELETE FROM sessions WHERE person_id=?", p);
      store.db.update("DELETE FROM accounts WHERE person_id=?", p);
      response.addHeader(
          "Set-Cookie", "aevum_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
      return Map.of("deleted", true);
    }
  }
}
