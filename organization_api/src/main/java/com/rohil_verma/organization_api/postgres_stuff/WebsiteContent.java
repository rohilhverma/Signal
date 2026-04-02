package com.rohil_verma.organization_api.postgres_stuff;

import java.util.List;
import java.util.Map;

public record WebsiteContent(String paywall, List<Map<String, Map<String, String>>> articles) {}
