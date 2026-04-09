package com.rohil_verma.organization_api.postgres_stuff;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.google.genai.Client;
import com.google.genai.types.Content;
import com.google.genai.types.GenerateContentConfig;
import com.google.genai.types.GenerateContentResponse;
import com.google.genai.types.Part;

import jakarta.annotation.PostConstruct;

@Service
public class GeminiModel {

    @Value("${GEMINI_API_KEY}")
    private String geminiAPIKey;

    private Client chatClient;

    @PostConstruct
    public void init() {
        chatClient = Client.builder().apiKey(geminiAPIKey).build();
    }

    public String handleResummarize(String prompt, String articleText) {
        try {
            String model = "gemini-2.5-flash-lite";
            if (prompt == "longer"){model="gemini-2.5-flash";}
            GenerateContentConfig config = GenerateContentConfig.builder()
                .responseMimeType("application/json")
                .systemInstruction(Content.fromParts(Part.fromText(prompt)))
                .build();
            
            GenerateContentResponse resummarization = chatClient.models.generateContent(model, articleText, config);
            String result = resummarization.text();
            if (result == null || result.isBlank()) return "Gemini returned an empty response.";
            return result;
        } catch (Exception e) {
            System.err.println("Gemini API error: " + e.getMessage());
            return "Gemini error: " + e.getMessage();
        }
    }
}
