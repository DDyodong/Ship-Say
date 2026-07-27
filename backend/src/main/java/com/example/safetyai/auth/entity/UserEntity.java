package com.example.safetyai.auth.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "users")
public class UserEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "employee_id", unique = true)
    private Long employeeId;

    @Column(name = "employee_no", unique = true, length = 50)
    private String employeeNo;

    @Column(nullable = false, unique = true, length = 80)
    private String username;

    @Column(name = "password_hash", nullable = false, columnDefinition = "TEXT")
    private String passwordHash;

    @Column(nullable = false, length = 80)
    private String name;

    @Column(nullable = false, length = 30)
    private String status;

    protected UserEntity() {
    }

    private UserEntity(Long employeeId, String employeeNo, String username, String passwordHash, String name) {
        this.employeeId = employeeId;
        this.employeeNo = employeeNo;
        this.username = username;
        this.passwordHash = passwordHash;
        this.name = name;
        this.status = "active";
    }

    public static UserEntity registeredUser(
        Long employeeId,
        String employeeNo,
        String username,
        String passwordHash,
        String name
    ) {
        return new UserEntity(employeeId, employeeNo, username, passwordHash, name);
    }

    public Long getId() {
        return id;
    }

    public String getUsername() {
        return username;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public String getName() {
        return name;
    }

    public String getStatus() {
        return status;
    }
}
