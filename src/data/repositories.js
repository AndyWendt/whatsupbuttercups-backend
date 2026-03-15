const toDate = (value) =>
  value || new Date().toISOString();

const isD1Result = (result) =>
  result && Array.isArray(result.results);

const normalizeRowList = (result) => {
  if (!result) {
    return [];
  }

  if (Array.isArray(result)) {
    return result;
  }

  if (isD1Result(result)) {
    return result.results;
  }

  return [];
};

const normalizeRow = (result) => {
  if (result == null) {
    return null;
  }

  if (Array.isArray(result)) {
    return result[0] || null;
  }

  if (isD1Result(result)) {
    return result.results[0] || null;
  }

  return result;
};

const unwrap = async (value) => {
  if (value && typeof value.then === "function") {
    return value;
  }

  return Promise.resolve(value);
};

const executeGet = async (db, sql, params = []) => {
  const statement = db.prepare(sql);
  if (typeof statement.get === "function") {
    return unwrap(statement.get(...params));
  }

  return unwrap(statement.bind(...params).first());
};

const executeAll = async (db, sql, params = []) => {
  const statement = db.prepare(sql);
  if (typeof statement.all === "function") {
    if (typeof statement.bind === "function") {
      return normalizeRowList(await unwrap(statement.bind(...params).all()));
    }
    return normalizeRowList(await unwrap(statement.all(...params)));
  }

  return normalizeRowList(await unwrap(statement.bind(...params).all()));
};

const executeRun = async (db, sql, params = []) => {
  const statement = db.prepare(sql);
  if (typeof statement.run === "function") {
    if (typeof statement.bind === "function") {
      return unwrap(statement.bind(...params).run());
    }
    return unwrap(statement.run(...params));
  }

  return unwrap(statement.bind(...params).run());
};

const buildDynamicUpdate = (updates = {}) => {
  const keys = Object.keys(updates).filter((key) => updates[key] !== undefined);
  if (keys.length === 0) {
    return { keys: [], sqlSet: "", values: [] };
  }

  const sqlSet = keys.map((key) => `${key} = ?`).join(", ");
  const values = keys.map((key) => updates[key]);
  return {
    keys,
    sqlSet,
    values,
  };
};

const listItemsForUserSQL = `
  SELECT * FROM items
  WHERE owner_user_id = ?
  OR household_id IN (
    SELECT household_id
    FROM household_members
    WHERE user_id = ?
  )
`;

const listCompletionsForUserInRangeSQL = `
  SELECT oc.item_id, oc.occurred_on, oc.completed_at
  FROM occurrence_completions AS oc
  JOIN items AS i ON i.id = oc.item_id
  WHERE (i.owner_user_id = ? OR i.household_id IN (
    SELECT household_id
    FROM household_members
    WHERE user_id = ?
  ))
  AND oc.occurred_on >= ?
  AND oc.occurred_on <= ?
`;

export const createRepository = (db) => {
  if (!db || typeof db.prepare !== "function") {
    throw new Error("Repository requires a SQL prepare-capable binding");
  }

  return {
    getProfileByFirebaseUid: async (firebaseUid) => {
      const user = normalizeRow(await executeGet(
        db,
        "SELECT * FROM users WHERE firebase_uid = ?",
        [firebaseUid],
      ));
      return user;
    },

    upsertProfile: async (firebaseUid, updates) => {
      const existing = await createRepository(db).getProfileByFirebaseUid(firebaseUid);
      const updated = {
        ...existing,
        ...updates,
        updated_at: toDate(updates.updated_at),
      };
      await executeRun(
        db,
        "UPDATE users SET email = ?, display_name = ?, updated_at = ? WHERE firebase_uid = ?",
        [updated.email, updated.display_name, updated.updated_at, firebaseUid],
      );
      return updated;
    },

    getUserByFirebaseUid: async (firebaseUid) => {
      return createRepository(db).getProfileByFirebaseUid(firebaseUid);
    },

    createUser: async ({
      firebaseUid,
      email = null,
      displayName = null,
      createdAt,
      id,
    }) => {
      const now = toDate(createdAt);
      const userId = id || crypto.randomUUID();
      const user = {
        id: userId,
        firebase_uid: firebaseUid,
        email,
        display_name: displayName,
        created_at: now,
        updated_at: now,
      };
      await executeRun(db, `
        INSERT OR IGNORE INTO users (
          id, firebase_uid, email, display_name, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `, [
        user.id,
        user.firebase_uid,
        user.email,
        user.display_name,
        user.created_at,
        user.updated_at,
      ]);
      const saved = await executeGet(db, "SELECT * FROM users WHERE firebase_uid = ?", [firebaseUid]);
      return normalizeRow(saved) || user;
    },

    createHousehold: async ({ id, name, creatorUserId, createdAt, updatedAt }) => {
      const now = toDate(createdAt);
      const household = {
        id,
        name,
        creator_user_id: creatorUserId,
        timezone: "UTC",
        created_at: now,
        updated_at: updatedAt || now,
      };
      await executeRun(db, `
        INSERT INTO households (
          id, name, timezone, created_at, updated_at
        ) VALUES (?, ?, 'UTC', ?, ?)
      `, [household.id, household.name, household.created_at, household.updated_at]);
      return household;
    },

    addHouseholdMember: async ({ householdId, userId, role }) => {
      const now = toDate();
      const member = {
        household_id: householdId,
        user_id: userId,
        role,
        created_at: now,
      };
      await executeRun(
        db,
        `
          INSERT OR REPLACE INTO household_members (
            household_id, user_id, role, created_at
          ) VALUES (?, ?, ?, ?)
        `,
        [member.household_id, member.user_id, member.role, member.created_at],
      );
      return member;
    },

    getHouseholdMembership: async (householdId, userId) => {
      return normalizeRow(
        await executeGet(
          db,
          "SELECT * FROM household_members WHERE household_id = ? AND user_id = ?",
          [householdId, userId],
        ),
      );
    },

    putInviteToken: async (invite) => {
      await executeRun(db, `
        INSERT INTO household_invites (
          id, household_id, inviter_user_id, invitee_email, token, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        invite.id || crypto.randomUUID(),
        invite.household_id,
        invite.inviter_user_id,
        invite.invitee_email,
        invite.token,
        invite.status || "pending",
        invite.created_at || toDate(),
        invite.updated_at || toDate(),
      ]);
      return invite;
    },

    getInviteToken: async (token) => normalizeRow(
      await executeGet(db, "SELECT * FROM household_invites WHERE token = ?", [token]),
    ),

    markInviteAccepted: async (token, payload) => {
      await executeRun(
        db,
        `
          UPDATE household_invites
          SET status = 'accepted',
              updated_at = ?
          WHERE token = ?
        `,
        [payload?.acceptedAt || toDate(), token],
      );
      const invite = normalizeRow(
        await executeGet(db, "SELECT * FROM household_invites WHERE token = ?", [token]),
      );
      return invite
        ? {
            ...invite,
            accepted_by: payload?.acceptedByUserId || invite.accepted_by || null,
          }
        : null;
    },

    createItem: async ({
      id,
      household_id,
      owner_user_id,
      title,
      recurrence,
      is_active = 1,
      created_at,
      updated_at,
    }) => {
      const now = toDate(updated_at || created_at);
      const item = {
        id,
        household_id: household_id || null,
        owner_user_id,
        title,
        recurrence,
        is_active: Number(is_active),
        created_at: now,
        updated_at: now,
      };
      await executeRun(db, `
        INSERT INTO items (
          id, household_id, owner_user_id, title, recurrence, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        item.id,
        item.household_id,
        item.owner_user_id,
        item.title,
        item.recurrence,
        item.is_active,
        item.created_at,
        item.updated_at,
      ]);
      return item;
    },

    listItemsForUser: async (userId) => normalizeRowList(
      await executeAll(db, listItemsForUserSQL, [userId, userId]),
    ),

    getItemById: async (itemId) => normalizeRow(
      await executeGet(db, "SELECT * FROM items WHERE id = ?", [itemId]),
    ),

    updateItem: async (itemId, updates) => {
      const { keys, sqlSet, values } = buildDynamicUpdate(updates);
      if (keys.length === 0) {
        return createRepository(db).getItemById(itemId);
      }

      await executeRun(
        db,
        `UPDATE items SET ${sqlSet} WHERE id = ?`,
        [...values, itemId],
      );
      return createRepository(db).getItemById(itemId);
    },

    getOccurrenceCompletion: async (itemId, occurredOn) => {
      const row = await executeGet(
        db,
        "SELECT * FROM occurrence_completions WHERE item_id = ? AND occurred_on = ?",
        [itemId, occurredOn],
      );
      return normalizeRow(row);
    },

    createOccurrenceCompletion: async ({ item_id, occurred_on, completed_at, user_id }) => {
      const row = {
        item_id,
        occurred_on,
        completed_at: completed_at || toDate(),
        user_id,
      };
      await executeRun(db, `
        INSERT OR IGNORE INTO occurrence_completions (
          item_id, occurred_on, completed_at, user_id
        ) VALUES (?, ?, ?, ?)
      `, [row.item_id, row.occurred_on, row.completed_at, row.user_id]);
      const existing = await executeGet(
        db,
        "SELECT * FROM occurrence_completions WHERE item_id = ? AND occurred_on = ?",
        [row.item_id, row.occurred_on],
      );
      return normalizeRow(existing);
    },

    deleteOccurrenceCompletion: async (itemId, occurredOn) => {
      await executeRun(
        db,
        "DELETE FROM occurrence_completions WHERE item_id = ? AND occurred_on = ?",
        [itemId, occurredOn],
      );
    },

    listCompletionsForUserInRange: async (userId, start, end) => normalizeRowList(
      await executeAll(db, listCompletionsForUserInRangeSQL, [userId, userId, start, end]),
    ),

    listVacationWindowsForUser: async (userId) => normalizeRowList(
      await executeAll(
        db,
        "SELECT * FROM vacation_windows WHERE user_id = ? ORDER BY starts_at ASC",
        [userId],
      ),
    ),

    getVacationWindowsForUser: async (userId) => normalizeRowList(
      await executeAll(
        db,
        "SELECT * FROM vacation_windows WHERE user_id = ? ORDER BY starts_at ASC",
        [userId],
      ),
    ),

    createVacationWindow: async ({ id, userId, startsAt, endsAt, now }) => {
      const createdAt = toDate(now);
      const window = {
        id,
        user_id: userId,
        starts_at: startsAt,
        ends_at: endsAt,
        created_at: createdAt,
        updated_at: createdAt,
      };
      await executeRun(db, `
        INSERT INTO vacation_windows (
          id, user_id, starts_at, ends_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `, [
        window.id,
        window.user_id,
        window.starts_at,
        window.ends_at,
        window.created_at,
        window.updated_at,
      ]);
      return window;
    },

    getDeviceRegistrationByToken: async (deviceToken) => normalizeRow(
      await executeGet(
        db,
        "SELECT * FROM device_registrations WHERE device_token = ?",
        [deviceToken],
      ),
    ),

    createDeviceRegistration: async ({
      id,
      userId,
      deviceToken,
      platform,
      now,
    }) => {
      const createdAt = toDate(now);
      const registration = {
        id,
        user_id: userId,
        device_token: deviceToken,
        platform,
        updated_at: createdAt,
        created_at: createdAt,
      };
      await executeRun(db, `
        INSERT OR REPLACE INTO device_registrations (
          id, user_id, device_token, platform, updated_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `, [
        registration.id,
        registration.user_id,
        registration.device_token,
        registration.platform,
        registration.updated_at,
        registration.created_at,
      ]);
      return registration;
    },

    updateDeviceRegistration: async (existing, fields) => {
      const platform = fields.platform || existing.platform;
      const now = fields.updated_at || toDate();
      await executeRun(db, `
        UPDATE device_registrations
        SET platform = ?, updated_at = ?
        WHERE device_token = ?
      `, [platform, now, existing.device_token]);
      return {
        ...existing,
        platform,
        updated_at: now,
      };
    },

    listDeviceRegistrationsForUser: async (userId) => normalizeRowList(
      await executeAll(
        db,
        "SELECT * FROM device_registrations WHERE user_id = ?",
        [userId],
      ),
    ),

    getNotificationEventByDedupKey: async (dedupeKey) => normalizeRow(
      await executeGet(
        db,
        "SELECT * FROM notification_events WHERE dedupe_key = ? LIMIT 1",
        [dedupeKey],
      ),
    ),

    createNotificationEvent: async ({
      userId,
      itemId,
      eventType,
      payload,
      now,
      dedupeKey,
    }) => {
      const createdAt = toDate(now);
      const event = {
        id: crypto.randomUUID(),
        item_id: itemId,
        user_id: userId,
        event_type: eventType,
        payload,
        created_at: createdAt,
        dedupe_key: dedupeKey,
      };
      await executeRun(db, `
        INSERT OR IGNORE INTO notification_events (
          id, item_id, user_id, event_type, payload, created_at, dedupe_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        event.id,
        event.item_id,
        event.user_id,
        event.event_type,
        event.payload,
        event.created_at,
        event.dedupe_key,
      ]);
      return event;
    },

    getLastReminderSentAtForItem: async (itemId) => {
      const row = await executeGet(
        db,
        `
          SELECT created_at
          FROM notification_events
          WHERE item_id = ?
            AND event_type = 'reminder'
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [itemId],
      );
      return normalizeRow(row);
    },
  };
};

export const bindRepositoryToEnv = (env = {}) => {
  const db = env.DB || env.db || env.D1 || env.d1 || null;
  if (!db) {
    return env;
  }

  const repo = createRepository(db);
  const output = { ...env };
  for (const [name, value] of Object.entries(repo)) {
    if (typeof output[name] !== "function") {
      output[name] = value;
    }
  }

  return output;
};
