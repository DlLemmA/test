import { expect, test, type Page } from "@playwright/test";
import { seedParcelComment } from "./seed";

async function openFixture(page: Page, comment: string | null = null): Promise<void> {
  await seedParcelComment(page, comment);
  await page.goto("/#/parcel/2");
}

test.describe("UpdateComment", () => {
  test("saves a note on blur and shows it in the edit drawer", async ({ page }) => {
    await openFixture(page);
    const note = "Заметка из деталей\nвторая строка";
    const textarea = page.locator("#parcelCommentText");

    await test.step("expand the inline note", async () => {
      await expect(textarea).toHaveValue("");
      await expect(page.locator("#parcelCommentBlock")).not.toHaveClass(/is-expanded/);
      await textarea.click();
      await expect(page.locator("#parcelCommentBlock")).toHaveClass(/is-expanded/);
    });

    await test.step("type and commit the note", async () => {
      await textarea.fill(note);
      await textarea.press("Escape");
      await expect(page.locator("#parcelCommentBlock")).not.toHaveClass(/is-expanded/);
      await expect(page.locator("#toastContainer .toast__message")).toHaveText("Заметка сохранена");
    });

    await test.step("survive reload and reach the edit drawer", async () => {
      await page.reload();
      await expect(textarea).toHaveValue(note.trim());
      await page.locator("#editParcel").click();
      await expect(page.locator("#parcelCommentInput")).toHaveValue(note.trim());
    });
  });

  test("clears a saved note from the inline editor", async ({ page }) => {
    await openFixture(page, "Старая заметка");
    const textarea = page.locator("#parcelCommentText");
    await expect(textarea).toHaveValue("Старая заметка");

    await test.step("empty the note and blur", async () => {
      await textarea.click();
      await textarea.fill("   ");
      await textarea.press("Escape");
      await expect(page.locator("#toastContainer .toast__message")).toHaveText("Заметка сохранена");
    });

    await test.step("stay cleared after reload", async () => {
      await page.reload();
      await expect(textarea).toHaveValue("");
    });
  });

  test("saves a note from the drawer and shows it inline", async ({ page }) => {
    await openFixture(page);
    const note = "Заметка из формы";
    const drawerNote = page.locator("#parcelCommentInput");

    await test.step("open the parcel edit drawer", async () => {
      await page.locator("#editParcel").click();
      await expect(page.locator("#parcelForm")).toBeVisible();
      await expect(drawerNote).toHaveValue("");
    });

    await test.step("fill and submit the drawer", async () => {
      await drawerNote.fill(note);
      await page.locator("#parcelForm button[type='submit']").click();
      await expect(page.locator("#parcelForm")).toHaveCount(0);
      await expect(page.locator("#toastContainer .toast__message")).toHaveText("Посылка сохранена");
    });

    await test.step("read it back on the detail view", async () => {
      await expect(page.locator("#parcelCommentText")).toHaveValue(note);
      await page.reload();
      await expect(page.locator("#parcelCommentText")).toHaveValue(note);
    });
  });

  test("clears a saved note from the drawer", async ({ page }) => {
    await openFixture(page, "Старая заметка");

    await test.step("empty the drawer field and save", async () => {
      await page.locator("#editParcel").click();
      await expect(page.locator("#parcelCommentInput")).toHaveValue("Старая заметка");
      await page.locator("#parcelCommentInput").fill("");
      await page.locator("#parcelForm button[type='submit']").click();
      await expect(page.locator("#toastContainer .toast__message")).toHaveText("Посылка сохранена");
    });

    await test.step("stay cleared on the detail view", async () => {
      await expect(page.locator("#parcelCommentText")).toHaveValue("");
      await page.reload();
      await expect(page.locator("#parcelCommentText")).toHaveValue("");
    });
  });
});
