plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose.compiler)
    alias(libs.plugins.hilt)
    alias(libs.plugins.ksp)
}

val releaseStorePath = providers.environmentVariable("POCKET_WEBSHELL_KEYSTORE_PATH").orNull
val releaseStorePassword = providers.environmentVariable("POCKET_WEBSHELL_KEYSTORE_PASSWORD").orNull
val releaseKeyAlias = providers.environmentVariable("POCKET_WEBSHELL_KEY_ALIAS").orNull
val releaseKeyPassword = providers.environmentVariable("POCKET_WEBSHELL_KEY_PASSWORD").orNull
val releaseSigningValues = listOf(
    releaseStorePath,
    releaseStorePassword,
    releaseKeyAlias,
    releaseKeyPassword,
)
val hasReleaseSigning = releaseSigningValues.all { !it.isNullOrBlank() }

check(hasReleaseSigning || releaseSigningValues.all { it.isNullOrBlank() }) {
    "Release signing is partially configured. Use scripts/build-release.ps1."
}

android {
    namespace = "com.webshell.app"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.webshell.app"
        minSdk = 29
        targetSdk = 36
        // 版本计数已重置，规则见 docs/VERSIONING.md
        versionCode = 17
        versionName = "0.1.16"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = file(requireNotNull(releaseStorePath))
                storePassword = requireNotNull(releaseStorePassword)
                keyAlias = requireNotNull(releaseKeyAlias)
                keyPassword = requireNotNull(releaseKeyPassword)
                enableV1Signing = true
                enableV2Signing = true
                enableV3Signing = true
                enableV4Signing = true
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release")
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
        compose = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    implementation(project(":core:model"))
    implementation(project(":core:data"))
    implementation(project(":core:designsystem"))
    implementation(project(":core:webengine"))
    implementation(project(":feature:home"))
    implementation(project(":feature:add"))
    implementation(project(":feature:browser"))
    implementation(project(":feature:me"))

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)

    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.material3)
    implementation(libs.compose.material.icons.extended)
    implementation(libs.compose.ui.tooling.preview)
    debugImplementation(libs.compose.ui.tooling)

    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    implementation(libs.androidx.hilt.navigation.compose)

    implementation(libs.haze)
    implementation(libs.haze.materials)
    implementation(libs.coil.compose)

    androidTestImplementation(libs.androidx.test.ext.junit)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.androidx.uiautomator)
    androidTestImplementation(libs.androidx.datastore.preferences)
    androidTestImplementation(libs.junit)
    testImplementation(libs.junit)
}
