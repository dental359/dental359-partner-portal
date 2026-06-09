const HS_TOKEN       = process.env.HUBSPOT_TOKEN;
const HS_PIPELINE_ID = '1322968563';
const HS_STAGE_ID    = '2190891498';

const TREATMENT_PRICES = {
  'scale-polish':      { label: 'Scale & Polish',              value: 325   },
  'whitening-trays':   { label: 'Take Home Whitening',         value: 650   },
  'whitening-gel':     { label: 'Take Home Gel (3 syringes)',  value: 150   },
  'composite-bonding': { label: 'Composite Bonding (6 teeth)', value: 3600  },
  'veneers':           { label: 'Porcelain Veneers (6 teeth)', value: 15000 },
  'all-on-4':          { label: 'All-On-4 (per arch)',         value: 27500 },
  'invisalign':        { label: 'Invisalign',                  value: 7500  },
  'unsure':            { label: 'Not Sure Yet',                value: 0     }
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const {
    firstName, lastName, phone, email,
    contactMethod, contactTime, notes,
    treatmentKey, partnerName, partnerBusiness
  } = body;

  const treatment  = TREATMENT_PRICES[treatmentKey] || { label: treatmentKey, value: 0 };
  const commission = +(treatment.value * 0.10).toFixed(2);

  const headers = {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${HS_TOKEN}`
  };

  try {
    let contactId = null;
    const contactRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        properties: {
          firstname:      firstName || '',
          lastname:       lastName  || '',
          phone:          phone     || '',
          email:          email     || '',
          hs_lead_status: 'NEW'
        }
      })
    });

    if (contactRes.ok) {
      const d = await contactRes.json();
      contactId = d.id;
    } else if (contactRes.status === 409) {
      const err = await contactRes.json();
      const match = err.message && err.message.match(/ID: (\d+)/);
      if (match) contactId = match[1];
    } else {
      const err = await contactRes.json();
      console.error('Contact error:', JSON.stringify(err));
    }
const dealName = `${firstName || ''}${lastName ? ' ' + lastName : ''} — ${treatment.label} (Partner Referral)`;

    const dealPayload = {
      properties: {
        dealname:           dealName,
        pipeline:           HS_PIPELINE_ID,
        dealstage:          HS_STAGE_ID,
        amount:             String(treatment.value),
        deal_currency_code: 'AUD',
        lead_source:        'Partner Referral',
        description: [
          `Treatment: ${treatment.label}`,
          `Partner: ${partnerName || ''} (${partnerBusiness || ''})`,
          `Contact preference: ${contactMethod || ''}`,
          `Best time to contact: ${contactTime || ''}`,
          notes ? `Notes: ${notes}` : ''
        ].filter(Boolean).join('\n')
      }
    };

    if (contactId) {
      dealPayload.associations = [{
        to: { id: contactId },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }]
      }];
    }

    const dealRes = await fetch('https://api.hubapi.com/crm/v3/objects/deals', {
      method: 'POST',
      headers,
      body: JSON.stringify(dealPayload)
    });

    if (!dealRes.ok) {
      const dealErr = await dealRes.json();
      console.error('Deal error:', JSON.stringify(dealErr));
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Deal creation failed', detail: dealErr })
      };
    }

    const dealData = await dealRes.json();
    console.log('Success — Deal ID:', dealData.id, 'Contact ID:', contactId);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, dealId: dealData.id, contactId })
    };

  } catch (err) {
    console.error('Function error:', err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
