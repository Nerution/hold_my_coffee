package com.goodthings.news;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onPause() {
        super.onPause();
        // The app may have loaded new stories; let the home-screen widget show the latest headline.
        GoodNewsWidget.refreshAll(this);
    }
}
