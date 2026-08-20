const express = require('express')
const cors = require('cors')
const axios = require('axios')

const app = express()

app.use(cors())
app.use(express.json())

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------

const BIKE_OBJECT_TYPE = '2-145432491'
const BREGO_API_KEY = process.env.BREGO_API_KEY

const hubspotHeaders = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer ' + process.env.HUBSPOT_TOKEN
}

// ---------------------------------------------------------------------------
// HEALTH
// ---------------------------------------------------------------------------

app.get('/', (req, res) => {
  res.send('Brego Bike API running')
})

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

const extractObjectId = (payload) => {
  if (!payload) return null

  if (Array.isArray(payload)) {
    return payload[0]?.objectId || payload[0]?.hs_object_id || null
  }

  return (
    payload.objectId ||
    payload.vid ||
    payload.object?.objectId ||
    payload.properties?.hs_object_id?.value ||
    payload.properties?.hs_object_id ||
    null
  )
}

// ---------------------------------------------------------------------------
// BREGO
// ---------------------------------------------------------------------------

const buildBregoProps = async (registration) => {
  const props = {}

  const bregoResponse = await axios.get(
    'https://api.brego.io/v1/vehicles/vrm/' +
      encodeURIComponent(registration) +
      '/valuations',
    {
      params: {
        countryCode: 'gb'
      },
      headers: {
        'X-API-Key': BREGO_API_KEY
      }
    }
  )

  const bregoData = bregoResponse.data
  const valuation = bregoData?.items?.[0]

  console.log(
    '[Brego] registration:',
    registration,
    '| retail average:',
    valuation?.retail?.average,
    '| trade average:',
    valuation?.trade?.average
  )

  props.brego_retail_average = valuation?.retail?.average ?? ''
  props.brego_trade_average = valuation?.trade?.average ?? ''

  const currency = (bregoData?.currencyCode || 'gbp').toUpperCase()
  const mileageUnit = bregoData?.mileageUnit || 'mi'

  const money = (value) => {
    if (value === undefined || value === null) return 'N/A'

    return (
      currency +
      ' ' +
      Number(value).toLocaleString('en-GB')
    )
  }

  const fullPricingLines = [
    'VEHICLE VALUATION',
    '',
    'Retail price:',
    '  Low:     ' + money(valuation?.retail?.low),
    '  Average: ' + money(valuation?.retail?.average),
    '  High:    ' + money(valuation?.retail?.high),
    '',
    'Trade price:',
    '  Low:     ' + money(valuation?.trade?.low),
    '  Average: ' + money(valuation?.trade?.average),
    '  High:    ' + money(valuation?.trade?.high),
    '',
    'Based on mileage: ' +
      (
        valuation?.mileage != null
          ? Number(valuation.mileage).toLocaleString('en-GB') +
            ' ' +
            mileageUnit
          : 'N/A'
      ),
    'Valuation date:    ' + (valuation?.date || 'N/A')
  ]

  props.brego_full_pricing = fullPricingLines.join('\n')

  return props
}

// ---------------------------------------------------------------------------
// HUBSPOT WEBHOOK -> BREGO ONLY
// ---------------------------------------------------------------------------

app.post('/hubspot-brego-webhook', async (req, res) => {

  // Respond immediately to HubSpot
  res.status(200).json({ received: true })

  try {
    console.log(
      '[brego-webhook] Payload:',
      JSON.stringify(req.body, null, 2)
    )

    const bikeId = extractObjectId(req.body)

    if (!bikeId) {
      console.log('[brego-webhook] No bike objectId found')
      return
    }

    // Get registration + mileage from HubSpot
    const bikeResponse = await axios.get(
      'https://api.hubapi.com/crm/v3/objects/' +
        BIKE_OBJECT_TYPE +
        '/' +
        bikeId +
        '?properties=vehicle_registration,mileage',
      {
        headers: hubspotHeaders
      }
    )

    const registration =
      bikeResponse.data.properties?.vehicle_registration

    const mileage =
      bikeResponse.data.properties?.mileage

    console.log(
      '[brego-webhook] bikeId:',
      bikeId,
      '| registration:',
      registration,
      '| mileage:',
      mileage
    )

    if (!registration) {
      console.log(
        '[brego-webhook] No vehicle_registration - skipping'
      )
      return
    }

    // Fetch Brego valuation only
    const bregoProps = await buildBregoProps(registration)

    console.log(
      '[brego-webhook] Properties to update:',
      JSON.stringify(bregoProps, null, 2)
    )

    // Update only Brego properties
    const patchResponse = await axios.patch(
      'https://api.hubapi.com/crm/v3/objects/' +
        BIKE_OBJECT_TYPE +
        '/' +
        bikeId,
      {
        properties: bregoProps
      },
      {
        headers: hubspotHeaders
      }
    )

    console.log(
      '[brego-webhook] Bike updated:',
      patchResponse.data.id
    )

  } catch (error) {
    console.log(
      '[brego-webhook] ERROR status:',
      error.response?.status
    )

    console.log(
      '[brego-webhook] ERROR data:',
      JSON.stringify(error.response?.data, null, 2)
    )

    console.log(
      '[brego-webhook] ERROR message:',
      error.message
    )
  }
})

// ---------------------------------------------------------------------------

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log('Brego server running on port ' + PORT)
  console.log('HUBSPOT_TOKEN set:', !!process.env.HUBSPOT_TOKEN)
  console.log('BREGO_API_KEY set:', !!BREGO_API_KEY)
})