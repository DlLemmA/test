<script setup lang="ts">
import { shallowRef } from "vue";
import { useRouter } from "vue-router";
import { enableTestSession, sendMagicLink } from "@/core/auth";
import AppIcon from "@/features/shared/ui/AppIcon.vue";

const router = useRouter();
const isDev = import.meta.env.DEV;

const email = shallowRef("");
const sending = shallowRef(false);
const message = shallowRef("");
const error = shallowRef("");

/** Dev-only shortcut through the same session seam the e2e suite uses. */
function enterTestMode(): void {
  enableTestSession();
  const next = router.currentRoute.value.query.next;
  const target =
    typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/parcels";
  window.location.hash = `#${target}`;
  window.location.reload();
}

async function submit(): Promise<void> {
  if (sending.value) return;
  sending.value = true;
  message.value = "";
  error.value = "";
  try {
    await sendMagicLink(email.value.trim());
    message.value = "Отправили ссылку для входа. Откройте её на этом устройстве.";
  } catch {
    error.value = "Не удалось отправить ссылку. Проверьте адрес и попробуйте ещё раз.";
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <main class="sign-in">
    <section class="sign-in__card" aria-labelledby="signInTitle">
      <span class="sign-in__mark" aria-hidden="true">
        <AppIcon name="package" />
      </span>
      <h1 id="signInTitle">Pindoчет</h1>
      <p class="sign-in__lead">Посылки, товары и расчёты — в одном журнале и без лишних полей.</p>

      <form class="sign-in__form" @submit.prevent="submit">
        <label for="signInEmail">Email</label>
        <input
          id="signInEmail"
          v-model="email"
          type="email"
          name="email"
          autocomplete="email"
          autocapitalize="none"
          autocorrect="off"
          spellcheck="false"
          enterkeyhint="done"
          placeholder="you@example.com"
          aria-describedby="signInHint signInStatus"
          autofocus
          required
        />
        <p id="signInHint" class="sign-in__hint">
          Ссылка придёт на почту. Доступ только у приглашённых.
        </p>
        <button
          id="sendMagicLink"
          class="btn-primary sign-in__submit"
          type="submit"
          :disabled="sending"
        >
          <AppIcon name="mail" />
          {{ sending ? "Отправляем…" : message ? "Отправить ещё раз" : "Отправить ссылку" }}
        </button>
      </form>

      <div v-if="message" id="signInSent" class="sign-in__sent" role="status" aria-live="polite">
        <strong>Проверьте почту</strong>
        <p>{{ message }} Затем вернитесь в приложение на главном экране.</p>
      </div>

      <div v-if="isDev" class="sign-in__dev">
        <span class="sign-in__dev-label">Для разработки</span>
        <button
          id="enterTestMode"
          type="button"
          class="btn-secondary sign-in__test"
          @click="enterTestMode"
        >
          <AppIcon name="flaskConical" /> Войти в тестовом режиме
        </button>
        <span class="sign-in__dev-hint">Без письма — на локальных данных.</span>
      </div>

      <p id="signInStatus" class="sign-in__status" role="status" aria-live="polite">
        <span v-if="error" class="is-error">{{ error }}</span>
      </p>
    </section>
  </main>
</template>

<style scoped>
/* Sign-in — the same paper slip, no SaaS card */
.sign-in {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--color-canvas);
}
.sign-in__card {
  width: min(100%, 420px);
  padding: 28px;
  border: 1px solid var(--color-line-strong);
  border-top: 3px solid var(--color-accent);
  border-radius: 12px;
  background: var(--color-paper);
  box-shadow: none;
}
.sign-in__mark {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  margin-bottom: 14px;
  border: 1px solid var(--color-accent-line);
  border-radius: 10px;
  background: var(--color-accent-wash);
  color: var(--color-accent-strong);
}
/* The SVG is injected by AppIcon via v-html, so it carries no scope attribute. */
.sign-in__mark :deep(.icon) {
  width: 20px;
  height: 20px;
}
.sign-in h1 {
  margin: 0;
  font-size: 1.75rem;
  letter-spacing: -0.03em;
}
.sign-in__lead {
  margin: 6px 0 20px;
  color: var(--color-muted);
  font-size: 14px;
}
.sign-in__form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sign-in__form label {
  font-weight: 600;
}
.sign-in__form input {
  min-height: 48px;
  padding: 10px 12px;
  border: 1px solid var(--color-line-strong);
  border-radius: 10px;
  background: #fff;
  color: var(--color-ink);
  font-size: max(1rem, 1em);
}
.sign-in__submit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 48px;
  margin-top: 4px;
}
.sign-in__sent {
  margin-top: 18px;
  padding: 12px 14px;
  border: 1px solid var(--color-line-strong);
  border-inline-start: 3px solid var(--color-positive);
  border-radius: 10px;
  background: var(--color-paper);
}
.sign-in__sent strong {
  display: block;
  color: var(--color-positive);
  font-size: 14px;
}
.sign-in__sent p {
  margin: 4px 0 0;
  color: var(--color-muted);
  font-size: 13px;
}
.sign-in__dev {
  display: grid;
  gap: 6px;
  margin-top: 20px;
  padding-top: 14px;
  border-top: 1px dashed var(--color-line-strong);
}
.sign-in__dev-label,
.sign-in__dev-hint {
  color: var(--color-muted);
  font-size: 11px;
}
.sign-in__dev-label {
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.sign-in__dev-hint {
  font-size: 12px;
}
.sign-in__test {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
}
.sign-in__hint,
.sign-in__status {
  margin: 0;
  color: var(--color-muted);
  font-size: 0.875rem;
}
.sign-in__status {
  min-height: 1.25em;
  margin-top: 10px;
}
.sign-in .is-error {
  color: var(--color-negative);
}
</style>
