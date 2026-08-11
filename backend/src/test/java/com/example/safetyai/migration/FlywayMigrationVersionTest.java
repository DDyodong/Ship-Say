package com.example.safetyai.migration;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

class FlywayMigrationVersionTest {
    private static final Pattern VERSIONED_MIGRATION = Pattern.compile("^V([^_]+)__.*\\.sql$");

    @Test
    void migrationVersionsAreUnique() throws IOException {
        Path migrationDirectory = Path.of("src", "main", "resources", "db", "migration");

        Map<String, List<String>> filesByVersion;
        try (var files = Files.list(migrationDirectory)) {
            filesByVersion = files
                .map(path -> path.getFileName().toString())
                .map(VERSIONED_MIGRATION::matcher)
                .filter(Matcher::matches)
                .collect(Collectors.groupingBy(
                    matcher -> matcher.group(1),
                    Collectors.mapping(Matcher::group, Collectors.toList())
                ));
        }

        Map<String, List<String>> duplicates = filesByVersion.entrySet().stream()
            .filter(entry -> entry.getValue().size() > 1)
            .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));

        assertThat(duplicates)
            .as("Flyway migration versions must be unique")
            .isEmpty();
    }
}
