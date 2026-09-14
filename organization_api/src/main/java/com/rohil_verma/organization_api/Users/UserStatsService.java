package com.rohil_verma.organization_api.Users;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.rohil_verma.organization_api.Personalization.ProfileService;

@Service
public class UserStatsService {

    private static final Logger log = LoggerFactory.getLogger(UserStatsService.class);

    /** Bounds the heatmap payload regardless of how long the account has existed. */
    private static final int MAX_ACTIVE_DATES_RETURNED = 120;

    /** How many topics the Stats bar list shows before it stops being scannable. */
    private static final int MAX_TOPICS_RETURNED = 8;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private UserActiveDayRepository userActiveDayRepository;

    @Autowired
    private UserActivityRepository userActivityRepository;

    @Autowired
    private ProfileService profileService;

    public record Stats(
        int currentStreakDays,
        int longestStreakDays,
        int totalActiveDays,
        int totalArticlesEngaged,
        Map<String, Long> bySource,
        List<LocalDate> activeDates,
        List<ProfileService.TopicAffinity> topTopics
    ) {}

    public Stats forUsername(String username) {
        User user = userRepository.findByUsername(username).orElseThrow();

        List<LocalDate> activeDates = userActiveDayRepository.findActiveDatesDesc(user.getId());
        StreakCalculator.Result streak = StreakCalculator.compute(activeDates, LocalDate.now());

        Map<String, Long> bySource = new LinkedHashMap<>();
        for (UserActivityRepository.SourceCount row : userActivityRepository.countByUserGroupedBySource(user.getId())) {
            bySource.put(row.getWebsiteUrl(), row.getArticleCount());
        }

        return new Stats(
            streak.currentStreak(),
            streak.longestStreak(),
            activeDates.size(),
            userActivityRepository.findByUser(user).size(),
            bySource,
            activeDates.size() > MAX_ACTIVE_DATES_RETURNED
                ? activeDates.subList(0, MAX_ACTIVE_DATES_RETURNED)
                : activeDates,
            topTopics(user)
        );
    }

    /**
     * Best-effort, matching how {@code UserService.saveUserActivity} treats the profile write:
     * personalization is a side feature here, and a failure in it should cost the topics
     * section, not the streak and heatmap the rest of the page is built on.
     */
    private List<ProfileService.TopicAffinity> topTopics(User user) {
        try {
            return profileService.topTopics(user.getId(), MAX_TOPICS_RETURNED);
        } catch (Exception e) {
            log.warn("stats: top topics unavailable for {}", user.getUsername(), e);
            return List.of();
        }
    }
}
