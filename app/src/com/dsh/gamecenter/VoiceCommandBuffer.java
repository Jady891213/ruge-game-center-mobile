package com.dsh.gamecenter;
import java.util.ArrayDeque;
import java.util.ArrayList;
/** Bounded event history: polls never collapse consecutive identical spoken commands. */
final class VoiceCommandBuffer {
    static final long MAX_AGE_MS = 1200;
    static final int LIMIT = 16;
    static final class Entry {
        final String command; final long at, serial;
        Entry(String command, long at, long serial) { this.command = command; this.at = at; this.serial = serial; }
    }
    private final ArrayDeque<Entry> entries = new ArrayDeque<Entry>();
    static boolean known(String name) { return name != null && !name.isEmpty() && "|left|right|up|down|forward|backward|turnLeft|turnRight|stop|jump|take|put|open|feed|deliver|".contains("|" + name + "|"); }
    void add(String name, long now, long serial) {
        if (!known(name)) return;
        prune(now);
        while (entries.size() >= LIMIT) entries.removeFirst();
        entries.addLast(new Entry(name, now, serial));
    }
    Entry[] snapshot(long now) { prune(now); return entries.toArray(new Entry[entries.size()]); }
    private void prune(long now) { while (!entries.isEmpty() && now - entries.peekFirst().at > MAX_AGE_MS) entries.removeFirst(); }
    void clear() { entries.clear(); }
}
