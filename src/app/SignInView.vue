<script setup lang="ts">
import { shallowRef } from "vue";
import { sendMagicLink } from "@/core/auth";

const email = shallowRef("");
const sending = shallowRef(false);
const message = shallowRef("");
const error = shallowRef("");

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
      <span class="sign-in__mark" aria-hidden="true">P</span>
      <h1 id="signInTitle">Pindoчет</h1>
      <p class="sign-in__lead">Учёт посылок для двоих. Вход по ссылке из письма.</p>

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
        <p id="signInHint" class="sign-in__hint">Вход доступен только приглашённым аккаунтам.</p>
        <button id="sendMagicLink" class="btn-primary" type="submit" :disabled="sending">
          {{ sending ? "Отправляем…" : "Отправить ссылку" }}
        </button>
      </form>

      <p id="signInStatus" class="sign-in__status" role="status" aria-live="polite">
        <span v-if="message" class="is-success">{{ message }}</span>
        <span v-else-if="error" class="is-error">{{ error }}</span>
      </p>
    </section>
  </main>
</template>

<style scoped>
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
  border: 1px solid var(--color-line);
  border-radius: 20px;
  background: var(--color-paper);
  box-shadow: 0 12px 40px -24px rgb(32 36 44 / 35%);
}

.sign-in__mark {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  margin-bottom: 12px;
  border-radius: 14px;
  background: var(--color-accent-soft);
  color: var(--color-accent-strong);
  font-weight: 800;
}

h1 {
  margin: 0;
  font-size: 1.75rem;
}

.sign-in__lead {
  margin: 6px 0 20px;
  color: var(--color-muted);
}

.sign-in__form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

label {
  font-weight: 600;
}

input {
  min-height: 48px;
  padding: 10px 12px;
  border: 1px solid var(--color-line-strong);
  border-radius: 12px;
  background: #fff;
  color: var(--color-ink);
  font-size: max(1rem, 1em);
}

input:focus-visible {
  outline: 3px solid var(--color-accent);
  outline-offset: 2px;
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

.is-success {
  color: var(--color-positive);
}

.is-error {
  color: var(--color-negative);
}
</style>
