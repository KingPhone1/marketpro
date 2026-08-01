const crypto = require("crypto");

const array = (value) => Array.isArray(value) ? value : [];
const iso = (value) => {
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.valueOf()) ? parsed.toISOString() : new Date().toISOString();
};
const nullableIso = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
};
const without = (value, keys) => Object.fromEntries(Object.entries(value || {}).filter(([key]) => !keys.includes(key)));
const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

function exportStore(store) {
  const users = array(store.users).map((user) => ({
    id: user.id,
    name: user.name || "Usuario",
    email: String(user.email || "").toLowerCase(),
    phone: user.phone || null,
    profile_image: user.profilePhoto || null,
    password_hash: user.passwordHash || "",
    password_salt: user.passwordSalt || "",
    email_verified: Boolean(user.emailVerified),
    verification_status: user.verificationStatus || (user.verified ? "approved" : "not_started"),
    verified_at: nullableIso(user.verifiedAt),
    metadata: without(user, ["cedula", "exactLocation", "documentPhoto", "privateMedia", "passwordHash", "passwordSalt", "profilePhoto"]),
    created_at: iso(user.createdAt),
    updated_at: iso(user.updatedAt || user.createdAt)
  }));
  const usersById = new Set(users.map((user) => user.id));
  const usersByEmail = new Map(users.filter((user) => user.email).map((user) => [user.email, user.id]));
  const legacyParticipantId = (participant) => {
    const rawId = participant.id || participant.userId || null;
    const email = String(participant.email || "").trim().toLowerCase();
    if (rawId && usersById.has(rawId)) return rawId;
    if (email && usersByEmail.has(email)) return usersByEmail.get(email);
    const legacyId = `legacy-participant-${hash(rawId || email || "unknown").slice(0, 20)}`;
    if (!usersById.has(legacyId)) {
      users.push({
        id: legacyId,
        name: participant.name || "Participante legado",
        email: email || `${legacyId}@invalid.marketpro`,
        phone: null,
        profile_image: null,
        password_hash: "",
        password_salt: "",
        email_verified: false,
        verification_status: "not_started",
        verified_at: null,
        metadata: { legacyParticipant: true, sourceIdentifier: rawId || null },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      usersById.add(legacyId);
      if (email) usersByEmail.set(email, legacyId);
    }
    return legacyId;
  };
  const privateIdentities = array(store.users).map((user) => ({
    user_id: user.id,
    encrypted_identity: { cedula: user.cedula || null, exactLocation: user.exactLocation || null },
    document_media: { documentPhoto: user.documentPhoto || null, privateMedia: user.privateMedia || [] },
    updated_at: iso(user.updatedAt || user.createdAt)
  }));
  const listings = array(store.products).map((product) => ({
    id: product.id,
    seller_id: (product.seller?.id || product.sellerId) ? legacyParticipantId({ id: product.seller?.id || product.sellerId }) : null,
    title: product.title || "Sin título",
    description: product.description || "",
    price: Number(product.price || 0),
    currency: product.currency || "UYU",
    category: product.category || "Sin categoría",
    condition: product.condition || "No especificado",
    location: product.location || null,
    status: product.status || "active",
    verified: Boolean(product.verified),
    posted_at: nullableIso(product.postedAt),
    metadata: without(product, ["id", "seller", "sellerId", "title", "description", "price", "currency", "category", "condition", "location", "status", "verified", "postedAt", "images"]),
    created_at: iso(product.postedAt),
    updated_at: iso(product.updatedAt || product.postedAt)
  }));
  const listingImages = array(store.products).flatMap((product) => array(product.images).map((storage_path, position) => ({
    listing_id: product.id,
    storage_path,
    is_cover: position === 0,
    position,
    metadata: {}
  })));
  const conversations = array(store.conversations).map((conversation) => ({
    id: conversation.id,
    listing_id: conversation.productId || null,
    order_id: conversation.orderId || null,
    created_at: iso(conversation.createdAt),
    last_message_at: nullableIso(conversation.lastMessageAt),
    metadata: without(conversation, ["id", "productId", "orderId", "participants", "messages", "createdAt", "lastMessageAt"])
  }));
  const participants = array(store.conversations).flatMap((conversation) => array(conversation.participants).map((participant) => ({
    conversation_id: conversation.id,
    user_id: legacyParticipantId(participant),
    role: participant.role || null,
    joined_at: iso(conversation.createdAt)
  }))).filter((entry) => entry.user_id);
  const messages = array(store.conversations).flatMap((conversation) => array(conversation.messages).map((message, index) => ({
    id: message.id || `${conversation.id}-message-${index}`,
    conversation_id: conversation.id,
    sender_id: message.senderId ? legacyParticipantId({ id: message.senderId }) : null,
    body: message.text || "",
    attachment: message.attachment ? { source: message.attachment, kind: message.attachmentKind || "attachment" } : null,
    risk: message.risk || null,
    read_at: nullableIso(message.readAt),
    created_at: iso(message.createdAt),
    metadata: without(message, ["id", "senderId", "text", "attachment", "attachmentKind", "risk", "readAt", "createdAt"])
  })));
  const orders = array(store.orders).map((order) => ({
    id: order.id,
    listing_id: order.productId || null,
    buyer_id: (order.buyer?.id || order.buyerId) ? legacyParticipantId({ id: order.buyer?.id || order.buyerId }) : null,
    seller_id: (order.seller?.id || order.sellerId) ? legacyParticipantId({ id: order.seller?.id || order.sellerId }) : null,
    amount: Number(order.amount || 0),
    currency: order.currency || "UYU",
    status: order.status || "pending",
    snapshot: order.snapshot || {},
    delivery: order.delivery || {},
    security: order.security || {},
    created_at: iso(order.createdAt),
    updated_at: iso(order.updatedAt || order.createdAt)
  }));
  const payments = array(store.orders).map((order) => ({
    id: `payment-${order.id}`,
    order_id: order.id,
    provider: "mercadopago",
    external_reference: order.mercadoPago?.externalReference || order.id,
    preference_id: order.mercadoPago?.preferenceId || null,
    provider_payment_id: order.mercadoPago?.paymentId || null,
    amount: Number(order.amount || 0),
    currency: order.currency || "UYU",
    status: order.mercadoPago?.status || order.paymentNotification?.status || "pending",
    raw_status: order.mercadoPago || {},
    created_at: iso(order.createdAt),
    updated_at: iso(order.updatedAt || order.createdAt)
  }));
  const disputes = array(store.orders).flatMap((order) => array(order.disputes).map((dispute, index) => ({
    id: dispute.id || `${order.id}-dispute-${index}`,
    order_id: order.id,
    opened_by: dispute.openedBy || null,
    status: dispute.status || "open",
    reason: dispute.reason || "",
    evidence: dispute.evidence || [],
    created_at: iso(dispute.createdAt),
    resolved_at: nullableIso(dispute.resolvedAt),
    metadata: without(dispute, ["id", "openedBy", "status", "reason", "evidence", "createdAt", "resolvedAt"])
  })));
  const reports = array(store.reports).map((report) => ({
    id: report.id,
    reporter_id: report.reporterId || null,
    subject_type: report.targetType || "listing",
    subject_id: report.targetId || report.productId || report.chatId || "unknown",
    status: report.status || "open",
    reason: report.reason || "",
    metadata: without(report, ["id", "reporterId", "targetType", "targetId", "productId", "chatId", "status", "reason", "createdAt", "resolvedAt"]),
    created_at: iso(report.createdAt),
    resolved_at: nullableIso(report.resolvedAt)
  }));
  const audits = array(store.adminAudit).map((event) => ({
    id: event.id,
    actor_id: event.userId || null,
    action: event.action || "unknown",
    details: event.details || {},
    ip_hash: event.ip ? hash(event.ip) : null,
    created_at: iso(event.createdAt)
  }));
  const result = { users, privateIdentities, listings, listingImages, conversations, participants, messages, orders, payments, disputes, reports, audits };
  return { sourceHash: hash(store), counts: Object.fromEntries(Object.entries(result).map(([key, value]) => [key, value.length])), tables: result };
}

module.exports = { exportStore };
