package com.dsh.gamecenter;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

/** Only user-selected scholarly source pages may leave the offline app. */
final class SourceLinks {
    static boolean allowed(String address) {
        if (address == null || address.length() > 1600) return false;
        try {
            URI uri = new URI(address);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null
                    || uri.getUserInfo() != null || uri.getPort() != -1 && uri.getPort() != 443) return false;
            String host = uri.getHost().toLowerCase(Locale.ROOT), path = uri.getPath();
            if (path == null || path.contains("..") || path.contains("\\")) return false;
            if (host.equals("humanum.arts.cuhk.edu.hk")) return path.startsWith("/Lexis/lexi-mf/");
            if (host.equals("zdic.net") || host.equals("www.zdic.net")) return path.startsWith("/hans/") || path.startsWith("/hant/");
            if (host.equals("commons.wikimedia.org")) return path.startsWith("/wiki/");
            if (host.equals("dict.variants.moe.edu.tw")) return path.equals("/dictView.jsp");
            return false;
        } catch (URISyntaxException ignored) { return false; }
    }
}
