pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        // Pleos Connect SDK (공식 문서 'Importing Vehicle SDK')
        maven { url = uri("https://nexus-playground.pleos.ai/repository/maven-releases/") }
        // 카카오맵 Android SDK v2
        maven { url = uri("https://devrepo.kakao.com/nexus/repository/kakaomap-releases/") }
    }
}
rootProject.name = "MungRoad"
include(":app")
