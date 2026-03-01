package com.rohil_verma.organization_api;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.rohil_verma.organization_api.postgres_stuff.LinksRepository;

import io.awspring.cloud.sqs.operations.SqsTemplate;



@Service
public class MessageSender {
    
    @Autowired
    private SqsTemplate sqsTemplate;

    @Value("${news_scraper_queue}")
    private String queueURL;

    public void sendScrapingTask(String string) {
        sqsTemplate.send(queueURL,"Hello");
        System.out.println("Message sent");
    }

    
}
