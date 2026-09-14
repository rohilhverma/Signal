package com.rohil_verma.organization_api.Users;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * Turns a set of active dates into a current streak and a longest streak. Pure: no
 * repository, no entity, no clock dependency beyond the {@code today} passed in, so it
 * can be checked against fixed dates instead of waiting for the calendar to cooperate.
 */
public final class StreakCalculator {

    public record Result(int currentStreak, int longestStreak) {}

    private StreakCalculator() {}

    /**
     * @param datesDesc distinct active dates, most recent first. Duplicates are tolerated
     *                   (treated as the same day) so a caller does not have to pre-dedupe.
     * @param today the day to measure "current" against.
     */
    public static Result compute(List<LocalDate> datesDesc, LocalDate today) {
        if (datesDesc.isEmpty()) return new Result(0, 0);

        int longest = 1;
        int run = 1;
        LocalDate prev = datesDesc.get(0);

        // Current streak: zero unless the most recent active day is today or yesterday -
        // otherwise the streak is broken and "3 days" from a week ago would be misleading
        // presented as a live number.
        long gapFromToday = ChronoUnit.DAYS.between(prev, today);
        int current = (gapFromToday <= 1) ? 1 : 0;
        boolean currentStillCounting = current == 1;

        for (int i = 1; i < datesDesc.size(); i++) {
            LocalDate date = datesDesc.get(i);
            long gap = ChronoUnit.DAYS.between(date, prev);

            if (gap == 0) {
                continue; // duplicate date, does not affect either count
            } else if (gap == 1) {
                run++;
                if (currentStillCounting) current++;
            } else {
                longest = Math.max(longest, run);
                run = 1;
                currentStillCounting = false;
            }
            prev = date;
        }
        longest = Math.max(longest, run);

        return new Result(current, longest);
    }
}
