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
    message.value = "Проверьте почту — отправили ссылку для входа.";
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Не удалось отправить ссылку";
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
      <p class="sign-in__eyebrow">Общий журнал · вход для двоих</p>
      <h1 id="signInTitle">Pindoчет</h1>
      <p class="sign-in__lead">Посылки, товары и расчёты — в одном журнале и без лишних полей.</p>

      <form class="sign-in__form" @submit.prevent="submit">
        <label for="signInEmail">Email</label>
        <input
          id="signInEmail"
          v-model="email"
          type="email"
          name="email"
          autocomplete="username"
          autocapitalize="none"
          autocorrect="off"
          spellcheck="false"
          enterkeyhint="done"
          placeholder="you@example.com"
          aria-describedby="signInHint signInStatus"
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
          {{ sending ? "Отправляем…" : "Отправить ссылку" }}
        </button>
      </form>

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
        <span v-if="message" class="is-success">{{ message }}</span>
        <span v-else-if="error" class="is-error">{{ error }}</span>
      </p>
    </section>
  </main>
</template>
