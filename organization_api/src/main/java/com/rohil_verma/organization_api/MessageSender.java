package com.rohil_verma.organization_api;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.rohil_verma.organization_api.postgres_stuff.links_Database;
import com.rohil_verma.organization_api.postgres_stuff.links_repository;

import io.awspring.cloud.sqs.operations.SqsTemplate;
import jakarta.persistence.Entity;



@Service
public class MessageSender {
    
    @Autowired
    private SqsTemplate sqsTemplate;

    @Autowired
    private links_repository links_repository;

    @Value("${news_scraper_queue}")
    private String queueURL;

    public void sendScrapingTask(String string) {
        // TODO Auto-generated method stub
        sqsTemplate.send(queueURL,"Hello");
        System.out.println("Message sent");
    }

    
}
