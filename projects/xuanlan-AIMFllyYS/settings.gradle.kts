pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "WebShell"

include(":app")
include(":core:model")
include(":core:data")
include(":core:designsystem")
include(":core:webengine")
include(":feature:home")
include(":feature:add")
include(":feature:browser")
include(":feature:me")
