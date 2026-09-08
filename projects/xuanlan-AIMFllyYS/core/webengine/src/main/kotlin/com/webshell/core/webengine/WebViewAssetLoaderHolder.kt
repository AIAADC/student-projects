package com.webshell.core.webengine

import android.content.Context
import androidx.webkit.WebViewAssetLoader

/** 每个引擎实例持有一个 AssetLoader（轻对象，可复用） */
class WebViewAssetLoaderHolder(context: Context) {
    val loader: WebViewAssetLoader = LocalWebHost.createLoader(context)
}
