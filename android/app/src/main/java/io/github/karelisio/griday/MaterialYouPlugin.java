package io.github.karelisio.griday;

import android.content.Context;
import android.content.res.Configuration;
import android.os.Build;
import androidx.annotation.Nullable;
import androidx.annotation.RequiresApi;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Arrays;

/**
 * Couleurs dynamiques (Material You, Android 12+) : expose au JS les palettes tonales du système.
 *
 * <p>{@code getPalettes()} répond {@code { supported: false }} avant Android 12 (API 31), sinon
 * {@code { supported: true, accent1, accent2, accent3, neutral1, neutral2 }}. Chaque palette est un
 * tableau de 13 entiers ARGB, dans l'ordre des ressources
 * {@code android.R.color.system_<palette>_{0,10,50,100,200,300,400,500,600,700,800,900,1000}},
 * soit les tons HCT 100, 99, 95, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0.
 *
 * <p>Conversion : un {@code int} Java est signé (0xFF112233 vaut -15654349). Il est envoyé
 * non signé ({@code & 0xFFFFFFFFL}, soit 4279312947) ; côté JS, {@code value >>> 0} redonne le même
 * entier et reste sans effet sur une valeur déjà non signée (src/platform/dynamicColor.ts).
 *
 * <p>Événement {@code paletteChanged} (sans données) : émis au retour dans l'app ou après un
 * changement de configuration quand les couleurs du système ne sont plus celles que le JS a lues.
 * Le JS relit alors {@code getPalettes()}.
 */
@CapacitorPlugin(name = "MaterialYou")
public class MaterialYouPlugin extends Plugin {

    static final String EVENT_PALETTE_CHANGED = "paletteChanged";

    /** Ordre des palettes dans {@link Palettes31#RESOURCES} et noms des clés de la réponse. */
    private static final String[] PALETTE_NAMES = { "accent1", "accent2", "accent3", "neutral1", "neutral2" };

    /** Nombre de tons par palette. */
    private static final int TONES = 13;

    /**
     * Dernières couleurs connues du JS, à plat (5 palettes x 13 tons). Null avant Android 12 ou si
     * la lecture a échoué. Écrit depuis le thread des plugins et le thread principal.
     */
    private volatile int[] lastSnapshot;

    @Override
    public void load() {
        lastSnapshot = readSnapshot();
    }

    @PluginMethod
    public void getPalettes(PluginCall call) {
        JSObject result = new JSObject();
        int[] snapshot = readSnapshot();
        if (snapshot == null) {
            result.put("supported", false);
            call.resolve(result);
            return;
        }
        lastSnapshot = snapshot;
        result.put("supported", true);
        for (int palette = 0; palette < PALETTE_NAMES.length; palette++) {
            JSArray colors = new JSArray();
            for (int tone = 0; tone < TONES; tone++) {
                colors.put(snapshot[palette * TONES + tone] & 0xFFFFFFFFL);
            }
            result.put(PALETTE_NAMES[palette], colors);
        }
        call.resolve(result);
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        notifyIfChanged();
    }

    @Override
    protected void handleOnConfigurationChanged(Configuration newConfig) {
        super.handleOnConfigurationChanged(newConfig);
        notifyIfChanged();
    }

    private void notifyIfChanged() {
        int[] now = readSnapshot();
        if (now == null || Arrays.equals(lastSnapshot, now)) {
            return;
        }
        lastSnapshot = now;
        notifyListeners(EVENT_PALETTE_CHANGED, new JSObject());
    }

    /** Couleurs système actuelles, ou null avant Android 12 (ou si le système ne les fournit pas). */
    @Nullable
    private int[] readSnapshot() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            return null;
        }
        try {
            return Palettes31.read(getContext());
        } catch (RuntimeException e) {
            // Ressources absentes (ROM atypique) : le JS retombe sur la palette de la marque.
            Logger.warn(getLogTag(), "Palettes système illisibles : " + e);
            return null;
        }
    }

    /**
     * Lecture des ressources introduites par Android 12. Classe à part : elle n'est chargée que
     * lorsque le niveau d'API le permet.
     */
    @RequiresApi(Build.VERSION_CODES.S)
    private static final class Palettes31 {

        private static final int[][] RESOURCES = {
            {
                android.R.color.system_accent1_0, android.R.color.system_accent1_10, android.R.color.system_accent1_50,
                android.R.color.system_accent1_100, android.R.color.system_accent1_200, android.R.color.system_accent1_300,
                android.R.color.system_accent1_400, android.R.color.system_accent1_500, android.R.color.system_accent1_600,
                android.R.color.system_accent1_700, android.R.color.system_accent1_800, android.R.color.system_accent1_900,
                android.R.color.system_accent1_1000,
            },
            {
                android.R.color.system_accent2_0, android.R.color.system_accent2_10, android.R.color.system_accent2_50,
                android.R.color.system_accent2_100, android.R.color.system_accent2_200, android.R.color.system_accent2_300,
                android.R.color.system_accent2_400, android.R.color.system_accent2_500, android.R.color.system_accent2_600,
                android.R.color.system_accent2_700, android.R.color.system_accent2_800, android.R.color.system_accent2_900,
                android.R.color.system_accent2_1000,
            },
            {
                android.R.color.system_accent3_0, android.R.color.system_accent3_10, android.R.color.system_accent3_50,
                android.R.color.system_accent3_100, android.R.color.system_accent3_200, android.R.color.system_accent3_300,
                android.R.color.system_accent3_400, android.R.color.system_accent3_500, android.R.color.system_accent3_600,
                android.R.color.system_accent3_700, android.R.color.system_accent3_800, android.R.color.system_accent3_900,
                android.R.color.system_accent3_1000,
            },
            {
                android.R.color.system_neutral1_0, android.R.color.system_neutral1_10, android.R.color.system_neutral1_50,
                android.R.color.system_neutral1_100, android.R.color.system_neutral1_200, android.R.color.system_neutral1_300,
                android.R.color.system_neutral1_400, android.R.color.system_neutral1_500, android.R.color.system_neutral1_600,
                android.R.color.system_neutral1_700, android.R.color.system_neutral1_800, android.R.color.system_neutral1_900,
                android.R.color.system_neutral1_1000,
            },
            {
                android.R.color.system_neutral2_0, android.R.color.system_neutral2_10, android.R.color.system_neutral2_50,
                android.R.color.system_neutral2_100, android.R.color.system_neutral2_200, android.R.color.system_neutral2_300,
                android.R.color.system_neutral2_400, android.R.color.system_neutral2_500, android.R.color.system_neutral2_600,
                android.R.color.system_neutral2_700, android.R.color.system_neutral2_800, android.R.color.system_neutral2_900,
                android.R.color.system_neutral2_1000,
            },
        };

        static int[] read(Context context) {
            int[] colors = new int[PALETTE_NAMES.length * TONES];
            for (int palette = 0; palette < RESOURCES.length; palette++) {
                for (int tone = 0; tone < TONES; tone++) {
                    colors[palette * TONES + tone] = ContextCompat.getColor(context, RESOURCES[palette][tone]);
                }
            }
            return colors;
        }
    }
}
