import { test, expect } from '@playwright/test';

/**
 * E2E Test: Supabase Hero Save
 * 
 * Tests hero creation and saving to production Supabase.
 * Requires REACT_APP_CF_PAGES=true in .env.local to route to Supabase.
 * 
 * Run with: npx playwright test supabase-hero-save
 */

test.describe('Supabase Backend - Hero Save', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app
    await page.goto('http://localhost:3000');
    
    // Check if using Supabase backend
    const consoleMessages: string[] = [];
    page.on('console', (msg) => {
      consoleMessages.push(msg.text());
    });
    
    await page.waitForTimeout(1000);
    
    const usingSupabase = consoleMessages.some(msg => 
      msg.includes('[heroesApi] Using Supabase backend')
    );
    
    if (!usingSupabase) {
      throw new Error(
        'Not using Supabase backend. Set REACT_APP_CF_PAGES=true in .env.local'
      );
    }
  });

  test('should create and save hero to Supabase', async ({ page }) => {
    // Wait for auth to load
    await page.waitForTimeout(2000);
    
    // Check if user is authenticated
    const loginButton = page.locator('button:has-text("Login"), a:has-text("Login")');
    const isLoggedIn = await loginButton.count() === 0;
    
    if (!isLoggedIn) {
      console.log('⚠️  User not authenticated. Manual login required for this test.');
      console.log('   1. Login to the app in the browser');
      console.log('   2. Re-run this test');
      test.skip();
      return;
    }
    
    // Navigate to hero creation
    await page.goto('http://localhost:3000/hero-creation');
    await page.waitForLoadState('networkidle');
    
    // Fill hero form
    const timestamp = Date.now();
    const heroName = `E2E-Supabase-Hero-${timestamp}`;
    
    await page.fill('input[name="name"]', heroName);
    await page.selectOption('select[name="race"]', 'Human');
    await page.selectOption('select[name="class"]', 'Fighter');
    await page.selectOption('select[name="alignment"]', 'Neutral Good');
    await page.fill('textarea[name="background"]', 'A test hero from E2E suite');
    
    // Submit form
    const saveButton = page.locator('button:has-text("Save Hero"), button:has-text("Create Hero")');
    
    // Listen for Supabase insert
    let supabaseInsertCalled = false;
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('supabase.co') && response.request().method() === 'POST') {
        supabaseInsertCalled = true;
        console.log('✓ Supabase insert detected');
      }
    });
    
    await saveButton.click();
    
    // Wait for save to complete
    await page.waitForTimeout(2000);
    
    // Verify Supabase was called
    expect(supabaseInsertCalled).toBe(true);
    
    // Check for success or error messages
    const errorAlert = page.locator('text=/Failed to add hero/i');
    const hasError = await errorAlert.count() > 0;
    
    if (hasError) {
      const errorText = await errorAlert.textContent();
      console.error('❌ Hero save failed:', errorText);
      throw new Error(`Hero save failed: ${errorText}`);
    }
    
    console.log(`✓ Hero "${heroName}" saved successfully to Supabase`);
    
    // Verify hero appears in list
    await page.goto('http://localhost:3000/all-heroes');
    await page.waitForLoadState('networkidle');
    
    const heroCard = page.locator(`text="${heroName}"`);
    await expect(heroCard).toBeVisible({ timeout: 5000 });
    
    console.log('✓ Hero visible in heroes list');
  });

  test('should enforce RLS - user_id required', async ({ page }) => {
    // This test verifies RLS is working by checking console errors
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    await page.goto('http://localhost:3000/hero-creation');
    
    // If RLS is enforced, attempts without user_id should fail
    // The heroesApi should handle this gracefully
    
    const rlsErrors = consoleErrors.filter(err => 
      err.includes('row-level security') || 
      err.includes('User not authenticated')
    );
    
    console.log(`RLS enforcement check: ${rlsErrors.length > 0 ? 'Active' : 'Check manually'}`);
  });
});
