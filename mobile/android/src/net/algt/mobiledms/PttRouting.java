package net.algt.mobiledms;

import android.content.Context;
import android.media.*;
import android.os.Build;
import android.os.Handler;
import java.util.ArrayList;
import java.util.List;

/** Android owns telephone audio priority. Only take communication focus during an enabled session. */
final class PttRouting {
    final AudioManager audio;
    private final Handler main;
    private final AudioFocusRequest request;
    private final Runnable change;
    private boolean focus, requested, open, configured;
    private int preferred;
    private final AudioDeviceCallback devices = new AudioDeviceCallback() {
        public void onAudioDevicesAdded(AudioDeviceInfo[] list) { route(); }
        public void onAudioDevicesRemoved(AudioDeviceInfo[] list) { route(); }
    };
    PttRouting(Context context, Handler main, Runnable change) {
        audio = context.getSystemService(AudioManager.class); this.main = main; this.change = change;
        AudioAttributes voice = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build();
        request = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
            .setAudioAttributes(voice).setWillPauseWhenDucked(true)
            .setOnAudioFocusChangeListener(value -> {
                if (!open || !requested) return;
                focus = value == AudioManager.AUDIOFOCUS_GAIN;
                if (value == AudioManager.AUDIOFOCUS_LOSS) requested = false;
                change.run();
            },main).build();
        open = true; audio.registerAudioDeviceCallback(devices,main);
    }
    void acquire() {
        if (!open || requested) return;
        requested = true;
        focus = audio.requestAudioFocus(request) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        if (!focus) requested = false;
        if (focus) route();
    }
    boolean call() {
        int mode = audio.getMode();
        return mode == AudioManager.MODE_IN_CALL || mode == AudioManager.MODE_RINGTONE
            || (Build.VERSION.SDK_INT >= 30 && mode == AudioManager.MODE_CALL_SCREENING);
    }
    boolean interrupted() { return !focus || call(); }
    List<AudioDeviceInfo> choices() {
        if (Build.VERSION.SDK_INT >= 31) {
            try { return audio.getAvailableCommunicationDevices(); }
            catch (SecurityException denied) { /* Still allow built-in speaker and wired output. */ }
        }
        List<AudioDeviceInfo> out = new ArrayList<>();
        for (AudioDeviceInfo d : audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS))
            if (priority(d) < 3) out.add(d);
        return out;
    }
    private static int priority(AudioDeviceInfo d) {
        switch (d.getType()) {
            case AudioDeviceInfo.TYPE_WIRED_HEADSET: case AudioDeviceInfo.TYPE_WIRED_HEADPHONES:
            case AudioDeviceInfo.TYPE_USB_HEADSET: case AudioDeviceInfo.TYPE_BLUETOOTH_SCO:
            case AudioDeviceInfo.TYPE_BLE_HEADSET: case AudioDeviceInfo.TYPE_HEARING_AID: return 0;
            case AudioDeviceInfo.TYPE_BUILTIN_SPEAKER: return 1;
            default: return 3;
        }
    }
    void choose(int id) { preferred = id; route(); }
    @SuppressWarnings("deprecation")
    void route() {
        if (!focus || !open || call()) return;
        try {
            audio.setMode(AudioManager.MODE_IN_COMMUNICATION);configured=true;
            AudioDeviceInfo choice = null;
            for (AudioDeviceInfo device : choices()) {
                if (preferred != 0 && device.getId() == preferred) { choice = device; break; }
                if (priority(device) < 3 && (choice == null || priority(device) < priority(choice))) choice = device;
            }
            if (choice == null) return;
            if (Build.VERSION.SDK_INT >= 31) audio.setCommunicationDevice(choice);
            else {
                boolean bluetooth = choice.getType() == AudioDeviceInfo.TYPE_BLUETOOTH_SCO;
                if (bluetooth) audio.startBluetoothSco(); else audio.stopBluetoothSco();
                audio.setBluetoothScoOn(bluetooth);
                audio.setSpeakerphoneOn(choice.getType() == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER);
            }
        } catch (SecurityException denied) { /* System default remains usable after denial. */ }
    }
    @SuppressWarnings("deprecation")
    void abandon() {
        boolean held = requested || focus || configured;
        focus = false; requested = false;
        configured=false;
        if (!held) return;
        audio.abandonAudioFocusRequest(request);
        try {
            if (Build.VERSION.SDK_INT >= 31) audio.clearCommunicationDevice();
            else { audio.stopBluetoothSco(); audio.setBluetoothScoOn(false); audio.setSpeakerphoneOn(false); }
            audio.setMode(AudioManager.MODE_NORMAL);
        } catch (SecurityException ignored) {}
    }
    void close() { open = false; audio.unregisterAudioDeviceCallback(devices); abandon(); }
}
