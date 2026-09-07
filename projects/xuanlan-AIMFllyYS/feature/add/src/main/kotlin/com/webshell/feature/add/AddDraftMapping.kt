package com.webshell.feature.add

import com.webshell.core.data.WebAppEntity

/** New shortcuts have default web zoom; existing entities never pass through this mapper. */
internal fun AddDraft.toNewEntity(page: Int, slot: Int, createdAt: Long, fallbackId: String): WebAppEntity =
    WebAppEntity(
        id = appId.ifBlank { fallbackId },
        title = title.trim().ifBlank { AddUrl.hostLabel(url) },
        url = if (isLocal) url else requireNotNull(AddUrl.normalize(url)),
        iconUrl = iconUrl.trim().takeIf {
            it.startsWith("http://") || it.startsWith("https://") || it.startsWith("/")
        },
        desktopMode = desktopMode,
        darkMode = darkMode,
        keepAlive = keepAlive,
        isFavorite = false,
        homePage = page,
        homeCellIndex = slot,
        folderId = null,
        createdAt = createdAt,
        isLocal = isLocal,
        externalLinksToBrowser = externalLinksToBrowser,
        textZoomPercent = 100,
    )
