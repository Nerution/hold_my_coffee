package com.goodthings.news;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

import org.json.JSONObject;

/**
 * Home-screen widget with the top good-news headline.
 * The app writes {"title","source",...} under the key "widget" with the Capacitor Preferences plugin,
 * which stores values in the SharedPreferences file "CapacitorStorage". The widget only reads it:
 * no network access, no data leaves the device.
 */
public class GoodNewsWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) {
            manager.updateAppWidget(id, buildViews(context));
        }
    }

    /** Redraws every placed widget; called when the app goes to the background. */
    public static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, GoodNewsWidget.class));
        if (ids.length == 0) return;
        RemoteViews views = buildViews(context);
        for (int id : ids) manager.updateAppWidget(id, views);
    }

    private static RemoteViews buildViews(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.good_news_widget);
        String title = context.getString(R.string.widget_empty);
        String source = "";
        try {
            SharedPreferences prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
            String raw = prefs.getString("widget", null);
            if (raw != null) {
                JSONObject data = new JSONObject(raw);
                if (data.optString("title").length() > 0) {
                    title = data.optString("title");
                    source = data.optString("source");
                }
            }
        } catch (Exception ignored) {
            // Leave the friendly placeholder text.
        }
        views.setTextViewText(R.id.widget_title, title);
        views.setTextViewText(R.id.widget_source, source);

        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pending = PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_root, pending);
        return views;
    }
}
