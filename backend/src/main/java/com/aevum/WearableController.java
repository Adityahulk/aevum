package com.aevum;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/wearables")
public class WearableController {
  final OpenWearables gateway;

  public WearableController(OpenWearables gateway) {
    this.gateway = gateway;
  }

  @GetMapping("/providers")
  Map<String, Object> providers(HttpServletRequest r) {
    return gateway.providers(Api.person(r));
  }

  @PostMapping("/{provider}/connect")
  Map<String, Object> connect(@PathVariable String provider, HttpServletRequest r) {
    return gateway.connect(Api.person(r), provider);
  }

  @PostMapping("/{provider}/sync")
  Map<String, Object> sync(@PathVariable String provider, HttpServletRequest r) throws Exception {
    return gateway.sync(Api.person(r), provider, true);
  }

  @DeleteMapping("/{provider}/disconnect")
  Map<String, Object> disconnect(@PathVariable String provider, HttpServletRequest r) {
    gateway.disconnect(Api.person(r), provider);
    return Map.of("connected", false);
  }

  @PostMapping("/mobile/session")
  Map<String, Object> mobile(HttpServletRequest r) {
    return gateway.mobileToken(Api.person(r));
  }
}
