package com.webshell.core.data.di

import com.webshell.core.data.metadata.SiteMetadataFetcher
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import java.util.concurrent.TimeUnit
import javax.inject.Singleton
import okhttp3.OkHttpClient

@Module
@InstallIn(SingletonComponent::class)
object MetadataModule {

    /** 元数据抓取专用客户端：10s 超时、跟随重定向、Android Chrome 移动 UA */
    @Provides
    @Singleton
    fun provideMetadataOkHttpClient(): OkHttpClient =
        OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(10, TimeUnit.SECONDS)
            .writeTimeout(10, TimeUnit.SECONDS)
            .callTimeout(15, TimeUnit.SECONDS)
            .followRedirects(true)
            .followSslRedirects(true)
            .addInterceptor { chain ->
                chain.proceed(
                    chain.request().newBuilder()
                        .header(
                            "User-Agent",
                            "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 " +
                                "(KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
                        )
                        .build(),
                )
            }
            .build()

    @Provides
    @Singleton
    fun provideSiteMetadataFetcher(client: OkHttpClient): SiteMetadataFetcher =
        SiteMetadataFetcher(client)
}
