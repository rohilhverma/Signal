package com.rohil_verma.organization_api.DynamoDB;

import java.io.InputStream;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.genai.Client;
import com.google.genai.types.Content;
import com.google.genai.types.GenerateContentConfig;
import com.google.genai.types.GenerateContentResponse;
import com.google.genai.types.Part;

import jakarta.annotation.PostConstruct;

/**
 * On-demand re-summarization.
 *
 * <p>Batch summarization of freshly scraped articles happens in the Lambda, not here. This
 * exists so that switching a summary between short / default / deep dive does not require
 * re-scraping the site, and it is the only summarization the API performs itself.
 *
 * <p><b>Prompts live in {@code resources/prompts.json}, not as Java string literals.</b> They are
 * the same three prompts {@code article_grabber/summarizer.js} sends — including the TAGS
 * paragraph that produces {@code articles.topics} — and the JSON is generated from that file
 * rather than retyped:
 * <pre>
 * node --input-type=module -e "import {prompts} from './summarizer.js'; \
 *   console.log(JSON.stringify(prompts, null, 2))" \
 *   &gt; ../organization_api/src/main/resources/prompts.json
 * </pre>
 * Two copies of the same prompt across two languages is a real cost. Keeping them in the same
 * JSON shape is the mitigation: a divergence is diffable, and it shows up immediately as tags
 * that no longer match the vocabulary the personalization profile was built from.
 */
@Service
public class GeminiModel {

    private static final Logger log = LoggerFactory.getLogger(GeminiModel.class);

    /** Model tier per depth. Deep dives are the one mode where the fuller model earns its cost. */
    private static final String MODEL_LONGER = "gemini-2.5-flash";
    private static final String MODEL_DEFAULT = "gemini-2.5-flash-lite";

    private static final String PROMPT_RESOURCE = "prompts.json";
    private static final String FALLBACK_MODE = "default";

    @Value("${GEMINI_API_KEY}")
    private String geminiAPIKey;

    private Client chatClient;
    private Map<String, String> prompts = Map.of();

    @PostConstruct
    public void init() {
        loadPrompts();
        chatClient = Client.builder().apiKey(geminiAPIKey).build();
    }

    /**
     * A missing prompt file is a packaging error, not a runtime condition, so this fails startup
     * rather than degrading to an empty prompt — which would still return 200 with unusable text
     * and overwrite a good summary slot with it.
     */
    private void loadPrompts() {
        try (InputStream in = new ClassPathResource(PROMPT_RESOURCE).getInputStream()) {
            prompts = new ObjectMapper().readValue(in, new TypeReference<Map<String, String>>() { });
            log.info("Loaded {} summarization prompt(s) from {}", prompts.size(), PROMPT_RESOURCE);
        } catch (Exception e) {
            throw new IllegalStateException(
                "Could not load " + PROMPT_RESOURCE + " - required for re-summarization", e);
        }
    }

    /**
     * @param mode one of {@code shorter}, {@code default}, {@code longer}; anything else falls
     *             back to {@code default} rather than sending a null prompt
     * @return the generated JSON array, or a descriptive failure string. Errors are returned
     *         rather than thrown so a summarization failure cannot 500 a feed request — the
     *         frontend's {@code extractSummaryText} filters these strings back out.
     */
    public String handleResummarize(String mode, String articleText) {
        String prompt = prompts.getOrDefault(mode, prompts.getOrDefault(FALLBACK_MODE, ""));
        String model = "longer".equals(mode) ? MODEL_LONGER : MODEL_DEFAULT;
        try {
            GenerateContentConfig config = GenerateContentConfig.builder()
                .responseMimeType("application/json")
                .systemInstruction(Content.fromParts(Part.fromText(prompt)))
                .build();

            GenerateContentResponse response = chatClient.models.generateContent(model, articleText, config);
            String result = response.text();
            if (result == null || result.isBlank()) {
                log.warn("Re-summarization for mode {} returned an empty response", mode);
                return "Gemini returned an empty response.";
            }
            return result;
        } catch (Exception e) {
            log.error("Re-summarization failed for mode {}: {}", mode, e.toString());
            return "Gemini error: " + e.getMessage();
        }
    }
}
