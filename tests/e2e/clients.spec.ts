import { test, expect } from './fixtures';

const uniqueSuffix = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

test.describe('Clients', () => {
  test('can open clients page and add a client', async ({ ownerPage, baseURL }) => {
    const page = ownerPage;
    await page.goto(`${baseURL}/practice/clients`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Clients' })).toBeVisible();

    await page.getByRole('button', { name: 'Add Client' }).first().click();
    await expect(page.getByLabel('Full name')).toBeVisible();

    const suffix = uniqueSuffix();
    const name = `E2E Client ${suffix}`;
    const email = `e2e-client-${suffix}@example.com`;

    await page.getByLabel('Full name').fill(name);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Phone').fill('4155550101');

    // Test address fields in client creation
    const addressInput = page.getByLabel(/address/i);
    if (await addressInput.isVisible()) {
      await addressInput.fill('123 Main St');
      
      // Try to wait for autocomplete suggestions but don't fail if they don't appear
      const suggestions = page.locator('[role="option"]');
      
      try {
        await expect(suggestions.first()).toBeVisible({ timeout: 3000 });
        const suggestionCount = await suggestions.count();
        
        if (suggestionCount > 0) {
          await suggestions.first().click();
          
          // Show structured fields
          const toggleButton = page.getByText(/show structured fields/i);
          if (await toggleButton.isVisible()) {
            await toggleButton.click();
          }
        }
      } catch (error) {
        // Autocomplete not available - continue with manual input
        console.log('Autocomplete not available in client creation test');
      }
    }

    const createResponsePromise = page.waitForResponse((response) => {
      return response.url().includes('/api/user-details/practice/') && response.request().method() === 'POST';
    });
    await page.getByRole('button', { name: 'Add Client' }).last().click();
    const createResponse = await createResponsePromise;
    expect(createResponse.status()).toBe(201);

    await expect(page.getByText(name, { exact: false })).toBeVisible();

    await page.getByRole('button', { name }).first().click();
    await expect(page.getByRole('heading', { name })).toBeVisible();

    const memo = `E2E memo ${suffix}`;
    const memoEdit = `E2E memo updated ${suffix}`;
    await page.getByLabel('Add your comment').fill(memo);
    const memoCreateResponsePromise = page.waitForResponse((response) => {
      return response.url().includes('/api/user-details/practice/') &&
        response.url().includes('/memos') &&
        response.request().method() === 'POST';
    });
    await page.getByRole('button', { name: 'Add memo' }).click();
    const memoCreateResponse = await memoCreateResponsePromise;
    expect(memoCreateResponse.status()).toBe(201);
    await expect(page.getByText(memo)).toBeVisible();

    const memoItem = page.locator('li', { hasText: memo }).first();
    await memoItem.getByRole('button', { name: 'Edit' }).click();
    await memoItem.getByRole('textbox').fill(memoEdit);
    const memoUpdateResponsePromise = page.waitForResponse((response) => {
      return response.url().includes('/api/user-details/practice/') &&
        response.url().includes('/memos') &&
        response.request().method() === 'PUT';
    });
    await memoItem.getByRole('button', { name: 'Save' }).click();
    const memoUpdateResponse = await memoUpdateResponsePromise;
    expect(memoUpdateResponse.status()).toBe(200);
    await expect(page.getByText(memoEdit)).toBeVisible();

    const updatedMemoItem = page.locator('li', { hasText: memoEdit }).first();
    const memoDeleteResponsePromise = page.waitForResponse((response) => {
      return response.url().includes('/api/user-details/practice/') &&
        response.url().includes('/memos') &&
        response.request().method() === 'DELETE';
    });
    await updatedMemoItem.getByRole('button', { name: 'Delete' }).click();
    const memoDeleteResponse = await memoDeleteResponsePromise;
    expect(memoDeleteResponse.status()).toBe(200);
    await expect(page.getByText(memoEdit)).toBeHidden();

    const actionsDropdown = page.locator('div[data-dropdown-id]').filter({
      has: page.getByLabel('Open client actions')
    }).first();
    await page.getByLabel('Open client actions').click();
    await actionsDropdown.getByRole('button', { name: 'Edit' }).click();
    const updatedName = `E2E Client Updated ${suffix}`;
    const updatedEmail = `e2e-client-updated-${suffix}@example.com`;
    await page.getByLabel('Full name').fill(updatedName);
    await page.getByLabel('Email').fill(updatedEmail);

    // Test address editing
    const editAddressInput = page.getByLabel(/address/i);
    if (await editAddressInput.isVisible()) {
      await editAddressInput.fill('456 Oak Ave');
      
      // Try to wait for autocomplete and select suggestion
      const editSuggestions = page.locator('[role="option"]');
      
      try {
        await expect(editSuggestions.first()).toBeVisible({ timeout: 3000 });
        const editSuggestionCount = await editSuggestions.count();
        
        if (editSuggestionCount > 0) {
          await editSuggestions.first().click();
        }
      } catch (error) {
        // Autocomplete not available for editing - continue with manual input
        console.log('Autocomplete not available in client editing test');
      }
    }
    const clientUpdateResponsePromise = page.waitForResponse((response) => {
      return response.url().includes('/api/user-details/practice/') && response.request().method() === 'PUT';
    });
    await page.getByRole('button', { name: 'Save Changes' }).click();
    const clientUpdateResponse = await clientUpdateResponsePromise;
    expect(clientUpdateResponse.status()).toBe(200);
    await expect(page.getByRole('heading', { name: updatedName })).toBeVisible();

    await page.getByLabel('Open client actions').click();
    page.once('dialog', (dialog) => dialog.accept());
    const clientDeleteResponsePromise = page.waitForResponse((response) => {
      return response.url().includes('/api/user-details/practice/') && response.request().method() === 'DELETE';
    });
    await actionsDropdown.getByRole('button', { name: 'Delete' }).click();
    const clientDeleteResponse = await clientDeleteResponsePromise;
    expect(clientDeleteResponse.status()).toBe(200);
    await expect(page.getByText(updatedName)).toBeHidden();
  });
});
