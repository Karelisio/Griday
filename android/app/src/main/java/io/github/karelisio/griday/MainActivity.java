package io.github.karelisio.griday;

import android.graphics.Color;
import android.os.Bundle;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin local : à enregistrer avant super.onCreate(), qui construit le pont Capacitor.
        registerPlugin(MaterialYouPlugin.class);

        // Edge-to-edge sur toutes les versions (imposé d'office dès Android 15) : le contenu passe sous
        // les barres système. Leur couleur et leur contraste viennent du thème (res/values*/styles.xml),
        // le style des icônes du JS (SystemBars.setStyle).
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        super.onCreate(savedInstanceState);

        // WebView transparent : tant que la page n'a rien peint, on voit la couleur de fenêtre du thème
        // (claire ou sombre) au lieu d'un flash blanc.
        if (getBridge() != null) {
            getBridge().getWebView().setBackgroundColor(Color.TRANSPARENT);
        }
    }
}
