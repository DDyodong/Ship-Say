package com.example.safetyai.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.AssertTrue;

public record RegisterRequest(
    @NotBlank String employeeNo,
    @NotBlank
    @Size(min = 4, max = 30)
    @Pattern(regexp = "^[A-Za-z0-9._-]+$", message = "영문, 숫자, ., _, -만 사용할 수 있습니다.")
    String username,
    @NotBlank @Size(min = 8, max = 72) String password,
    @NotBlank String passwordConfirm,
    @NotBlank String name,
    @AssertTrue(message = "필수 약관에 동의해야 합니다.") boolean termsAgreed
) {
}
