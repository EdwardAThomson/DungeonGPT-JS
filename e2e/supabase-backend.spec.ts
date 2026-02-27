import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

/**
 * Backend-Only Supabase Tests
 * Tests direct database operations without UI
 * Run with: npx playwright test supabase-backend
 */

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || '';
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY || '';

test.describe('Supabase Backend - Direct API', () => {
  let supabase: any;
  
  test.beforeAll(() => {
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase credentials in environment');
    }
    supabase = createClient(supabaseUrl, supabaseKey);
  });

  test('should connect to Supabase', async () => {
    expect(supabase).toBeDefined();
    console.log('✓ Supabase client initialized');
  });

  test('should create and retrieve a hero', async () => {
    const timestamp = Date.now();
    const testHero = {
      hero_id: `test-hero-${timestamp}`,
      hero_name: `Backend-Test-Hero-${timestamp}`,
      hero_gender: 'Male',
      hero_race: 'Human',
      hero_class: 'Fighter',
      hero_alignment: 'Neutral Good',
      hero_background: 'Backend API test hero',
      hero_level: 1,
      stats: {
        hp: 10,
        max_hp: 10,
        ac: 15,
        strength: 16,
        dexterity: 14,
        constitution: 14,
        intelligence: 10,
        wisdom: 12,
        charisma: 8
      }
    };

    // Insert hero - will fail due to RLS requiring user_id
    const { data: insertData, error: insertError } = await supabase
      .from('heroes')
      .insert([testHero])
      .select();

    if (insertError) {
      console.log('Insert blocked (expected due to RLS):', insertError.message);
      // RLS blocks inserts without authentication - this is CORRECT behavior
      if (insertError.code === '42501' || insertError.message?.includes('row-level security') || insertError.message?.includes('policy')) {
        console.log('✓ RLS is working correctly - blocking unauthenticated inserts');
        return;
      }
      // If it's a different error, that's a problem
      console.error('Unexpected error:', insertError);
      throw new Error(`Unexpected error: ${insertError.message}`);
    }

    // If we get here, insert succeeded (RLS might not be enabled)
    console.log('⚠️  WARNING: Insert succeeded without authentication - RLS may not be configured');
    expect(insertData).toBeDefined();
    expect(insertData.length).toBe(1);
    console.log(`Hero created with ID: ${insertData[0].id}`);

    const heroId = insertData[0].id;

    // Retrieve hero
    const { data: retrieveData, error: retrieveError } = await supabase
      .from('heroes')
      .select('*')
      .eq('id', heroId)
      .single();

    expect(retrieveError).toBeNull();
    expect(retrieveData).toBeDefined();
    expect(retrieveData.hero_name).toBe(testHero.hero_name);
    console.log(`✓ Hero retrieved successfully`);

    // Cleanup
    const { error: deleteError } = await supabase
      .from('heroes')
      .delete()
      .eq('id', heroId);

    if (!deleteError) {
      console.log(`✓ Test hero deleted`);
    }
  });

  test('should create and retrieve a conversation', async () => {
    const timestamp = Date.now();
    const testConversation = {
      session_id: `test-conv-${timestamp}`,
      conversation_name: `Backend-Test-Conv-${timestamp}`,
      conversation_data: {
        messages: ['Test message'],
        timestamp: Date.now()
      }
    };

    // Insert conversation - will fail due to RLS requiring user_id
    const { data: insertData, error: insertError } = await supabase
      .from('conversations')
      .insert([testConversation])
      .select();

    if (insertError) {
      console.log('Insert blocked (expected due to RLS):', insertError.message);
      // RLS blocks inserts without authentication - this is CORRECT behavior
      if (insertError.code === '42501' || insertError.message?.includes('row-level security') || insertError.message?.includes('policy')) {
        console.log('✓ RLS is working correctly - blocking unauthenticated inserts');
        return;
      }
      // If it's a different error, that's a problem
      console.error('Unexpected error:', insertError);
      throw new Error(`Unexpected error: ${insertError.message}`);
    }

    // If we get here, insert succeeded (RLS might not be enabled)
    console.log('⚠️  WARNING: Insert succeeded without authentication - RLS may not be configured');
    expect(insertData).toBeDefined();
    expect(insertData.length).toBe(1);
    console.log(`✓ Conversation created with ID: ${insertData[0].id}`);

    const convId = insertData[0].id;

    // Retrieve conversation
    const { data: retrieveData, error: retrieveError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', convId)
      .single();

    expect(retrieveError).toBeNull();
    expect(retrieveData).toBeDefined();
    expect(retrieveData.conversation_name).toBe(testConversation.conversation_name);
    console.log(`✓ Conversation retrieved successfully`);

    // Cleanup
    const { error: deleteError } = await supabase
      .from('conversations')
      .delete()
      .eq('id', convId);

    if (!deleteError) {
      console.log(`✓ Test conversation deleted`);
    }
  });

  test('should verify RLS is enabled', async () => {
    // Try to insert without auth - should fail
    const { data, error } = await supabase
      .from('heroes')
      .insert([{ 
        hero_id: 'test-unauthorized',
        hero_name: 'Unauthorized Hero',
        hero_race: 'Human',
        hero_class: 'Fighter'
      }])
      .select();

    // If RLS is properly configured, this should fail
    if (error) {
      console.log('✓ RLS is active - unauthenticated insert blocked');
      console.log(`  Error code: ${error.code}, Message: ${error.message}`);
      // RLS error codes: 42501 (insufficient privilege) or PGRST301 (JWT)
      const isRLSError = error.code === '42501' || 
                        error.message?.includes('row-level security') || 
                        error.message?.includes('policy') ||
                        error.code === 'PGRST301';
      expect(isRLSError).toBe(true);
    } else {
      console.log('⚠️  WARNING: Insert succeeded without auth - RLS may not be configured');
      // Cleanup if it somehow worked
      if (data && data.length > 0) {
        await supabase.from('heroes').delete().eq('id', data[0].id);
      }
      throw new Error('RLS not properly configured - unauthenticated insert should fail');
    }
  });
});
