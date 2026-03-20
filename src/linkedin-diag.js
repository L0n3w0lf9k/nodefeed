require('dotenv').config();
const fetch = require('node-fetch');

async function diagnose() {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  if (!token || token === 'your_linkedin_access_token') {
    console.error('\n❌ Error: LINKEDIN_ACCESS_TOKEN is missing or not set in your .env file.');
    console.log('Please follow the "Credential Guide" in the implementation plan to get a token.\n');
    return;
  }

  console.log('\n--- LinkedIn Diagnostic ---\n');
  console.log('Testing token validity...');

  try {
    // 1. Get Person Info
    const meRes = await fetch('https://api.linkedin.com/v2/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!meRes.ok) {
      const err = await meRes.text();
      console.error(`❌ Failed to fetch Person info: HTTP ${meRes.status}`);
      console.error(`Response: ${err}\n`);
      if (meRes.status === 401) console.log('Tip: Your token may be expired or invalid.\n');
      return;
    }

    const meData = await meRes.json();
    const personUrn = `urn:li:person:${meData.id}`;
    console.log(`✅ Token is VALID for: ${meData.localizedFirstName} ${meData.localizedLastName}`);
    console.log(`📌 Your Person URN: ${personUrn}`);

    // 2. Get Organizations (Pages)
    console.log('\nChecking for Organization (Page) access...');
    const orgRes = await fetch('https://api.linkedin.com/v2/organizationalEntityAcls?q=roleAssignee&role=ADMIN&state=APPROVED', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (orgRes.ok) {
      const orgData = await orgRes.json();
      const orgs = orgData.elements || [];
      if (orgs.length === 0) {
        console.log('ℹ️ No managed organizations found for this token.');
      } else {
        console.log(`✅ Found ${orgs.length} organization(s):`);
        for (const org of orgs) {
          const orgUrn = org.organizationalTarget;
          console.log(`   🏢 ${orgUrn}`);
        }
      }
    } else {
      console.warn('⚠️ Could not fetch organization list (check if token has w_organization_social scope).');
    }

    console.log('\n--- Summary ---');
    console.log(`If you want to post to your PROFILE, set:`);
    console.log(`LINKEDIN_AUTHOR_URN=${personUrn}`);
    console.log(`\nIf you want to post to a PAGE, set LINKEDIN_AUTHOR_URN to one of the organizations above.`);
    console.log('----------------\n');

  } catch (e) {
    console.error(`❌ Diagnostic failed: ${e.message}`);
  }
}

diagnose();
