package com.rohil_verma.organization_api.Users;

import java.time.LocalDate;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public interface UserActiveDayRepository extends JpaRepository<com.rohil_verma.organization_api.UserActiveDay, Integer> {

    /**
     * Marks today active for a user. {@code DO NOTHING} rather than an upsert with a
     * value to set - the row for a given (user, day) is either present or absent, there
     * is nothing on it to merge. Native query for the same reason every other upsert in
     * this codebase is: JPQL has no {@code ON CONFLICT}.
     */
    @Modifying
    @Transactional
    @Query(value = """
        INSERT INTO user_active_days (user_id, activity_date)
        VALUES (:userId, :activityDate)
        ON CONFLICT (user_id, activity_date) DO NOTHING
        """, nativeQuery = true)
    void markActive(@Param("userId") Integer userId, @Param("activityDate") LocalDate activityDate);

    @Query("select d.activityDate from UserActiveDay d where d.user.id = :userId order by d.activityDate desc")
    List<LocalDate> findActiveDatesDesc(@Param("userId") Integer userId);
}
