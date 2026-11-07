/***********************************************
> Locket AI Filter Modifier (Bản riêng cho NTP)
> Tác giả: ntanphatt
> Tính năng:
  - Chiều Request: Giả lập US, xóa sạch cache.
  - Chiều Response:
    1. Tự động nhận diện tài khoản chủ máy (Self): Cấp Gold, vương miện, mở khóa AI & Sticker.
    2. Gỡ bỏ hoàn toàn mã lỗi, gỡ che mờ ảnh (unblur).
***********************************************/

const SELF_UID_KEY = "LOCKET_SELF_UID";
const SELF_USERNAME_KEY = "LOCKET_SELF_USERNAME";

// Hàm gán toàn bộ cờ Gold & Huy hiệu tim vàng
function applyGoldBadge(target) {
    if (!target || typeof target !== "object") return;
    target.badge = "locket_gold";
    target.is_gold = true;
    target.has_gold = true;
    target.gold = true;
    target.gold_subscription = true;
    target.has_gold_subscription = true;
    target.tier = "gold";
    target.subscription_status = "active";
}

// =========================================================================
// 1. CHIỀU REQUEST: Xóa cache & Giả lập US
// =========================================================================
if (typeof $response === "undefined") {
    let headers = Object.assign({}, $request.headers || {});

    for (let k of Object.keys(headers)) {
        if (['if-none-match', 'if-modified-since', 'x-revenuecat-etag'].includes(k.toLowerCase())) {
            delete headers[k];
        }
    }

    headers["X-App-Region"] = "US";
    headers["X-Country-Code"] = "US";
    headers["X-Device-Country"] = "US";
    headers["X-Timezone"] = "America/Los_Angeles";

    $done({ headers: headers, body: $request.body });
}

// =========================================================================
// 2. CHIỀU RESPONSE: Mở khóa Sticker, Filter AI, unblur
// =========================================================================
else {
    let body = $response.body;
    let status = $response.status || $response.statusCode || 200;

    if (body && typeof body === "string") {
        try {
            let obj = JSON.parse(body);

            // Gỡ lỗi 402, 403 nếu có
            if (status === 402 || status === 403 || status === 400 || (obj && obj.error)) {
                status = 200;
                if (obj && obj.error) {
                    obj = {
                        result: {
                            status: 200,
                            is_gold: true,
                            is_locked: false,
                            requires_gold: false,
                            unlocked: true,
                            data: obj.error.details || {}
                        }
                    };
                }
            }

            function transformNode(node) {
                if (!node || typeof node !== "object") return;

                if (Array.isArray(node)) {
                    for (let i = 0; i < node.length; i++) {
                        transformNode(node[i]);
                    }
                    return;
                }

                // Nhận diện tài khoản chủ máy (Self)
                const isSelf = ("email" in node || "phone_number" in node || "push_token" in node || "fcm_token" in node || "can_use_filters" in node || "can_use_gold_features" in node);

                if (isSelf) {
                    applyGoldBadge(node);
                    // Mở khóa toàn diện tính năng AI, Sticker và Filter
                    node.can_use_filters = true;
                    node.can_use_gold_features = true;
                    node.can_generate_filtered_image = true;
                    node.can_create_filtered_image = true;
                    node.has_ai_access = true;
                    node.filter_access = true;
                    node.can_use_stickers = true;
                    node.sticker_access = true;
                    node.unlimited_stickers = true;

                    const uid = String(node.uid || node.user_id || node.id || "").toLowerCase().trim();
                    const username = String(node.username || "").toLowerCase().trim();

                    if (typeof $persistentStore !== "undefined") {
                        if (uid) $persistentStore.write(uid, SELF_UID_KEY);
                        if (username) $persistentStore.write(username, SELF_USERNAME_KEY);
                    }
                }

                // Gỡ toàn bộ cờ khóa và che mờ
                const falseFlags = [
                    "is_locked", "locked", "requires_gold", "require_gold",
                    "gold_only", "is_gold_only", "paywall", "show_paywall",
                    "show_upsell", "upsell", "blurred", "is_blurred", "needs_gold"
                ];
                for (let f of falseFlags) {
                    if (f in node) node[f] = false;
                }

                const trueFlags = [
                    "can_view", "unlocked", "is_unlocked", "is_free", "free",
                    "can_use_filter", "allowed", "can_use_filters", "can_use_stickers",
                    "sticker_access", "is_available", "enabled"
                ];
                for (let t of trueFlags) {
                    if (t in node) node[t] = true;
                }

                // Ép mở khóa các item sticker/filter cụ thể
                if ("item_type" in node || "sticker_id" in node || "filter_id" in node) {
                    node.is_locked = false;
                    node.requires_gold = false;
                    node.unlocked = true;
                    node.is_free = true;
                }

                // Gỡ che mờ ảnh (Unblur)
                const clearUrl = node.unblurred_url || node.unlocked_url || node.result_url || node.image_url || node.transformed_image_url || node.url;
                if (clearUrl && typeof clearUrl === "string" && clearUrl.startsWith("http")) {
                    if ("blurred_url" in node) node.blurred_url = clearUrl;
                    if ("blurred_image_url" in node) node.blurred_image_url = clearUrl;
                    if ("preview_url" in node && node.is_blurred) node.preview_url = clearUrl;
                }

                // Đệ quy tiếp tục quét các node con
                for (let k of Object.keys(node)) {
                    if (k !== "badge" && k !== "is_gold" && k !== "has_gold" && k !== "tier" && k !== "gold") {
                        transformNode(node[k]);
                    }
                }
            }

            transformNode(obj);
            body = JSON.stringify(obj);
        } catch (e) {}
    }

    $done({
        status: status,
        headers: Object.assign({}, ($response && $response.headers) || {}, {
            "content-type": "application/json"
        }),
        body: body
    });
}
