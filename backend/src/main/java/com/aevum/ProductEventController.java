package com.aevum;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/product-events")
public class ProductEventController {
  private static final Logger log = LoggerFactory.getLogger(ProductEventController.class);
  private static final Set<String> ALLOWED = Set.of(
      "insight_viewed", "import_confirmed", "ask_answer_received", "experiment_started",
      "follow_up_completed", "personal_review_opened");
  private final Auth auth;

  public ProductEventController(Auth auth) {
    this.auth = auth;
  }

  @PostMapping
  Map<String, Object> record(@RequestBody Map<String, Object> body, HttpServletRequest request) {
    String person = Api.person(request);
    auth.require(person, "health");
    String name = Api.str(body, "name", "");
    if (!ALLOWED.contains(name)) throw new Api.Failure(422, "Unsupported product event.");
    // Keep only an allowlisted event name. Never log user identity, health data, or question text.
    log.info("product_event name={}", name);
    return Map.of("ok", true);
  }
}
