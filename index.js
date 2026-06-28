const express = require('express')
const cors    = require('cors')
const axios   = require('axios')

const app = express()

app.use(cors())
app.use(express.json())

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------

const BIKE_OBJECT_TYPE = '2-145432491'
const UKVD_API_KEY     = process.env.UKVD_API_KEY
const BREGO_API_KEY    = process.env.BREGO_API_KEY

const hubspotHeaders = {
  'Content-Type':  'application/json',
  'Authorization': 'Bearer ' + process.env.HUBSPOT_TOKEN
}

// ---------------------------------------------------------------------------
// HEALTH / DIAGNOSTICS
// ---------------------------------------------------------------------------

app.get('/', (req, res) => {
  res.send('Bike API running')
})

app.get('/check-env', (req, res) => {
  res.json({
    hasToken:    !!process.env.HUBSPOT_TOKEN,
    tokenPrefix: process.env.HUBSPOT_TOKEN
      ? process.env.HUBSPOT_TOKEN.substring(0, 15) + '...'
      : 'NOT SET'
  })
})

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

// HubSpot dates come back in different formats depending on the package.
const toTimestamp = (dateString) => {
  if (!dateString) return ''
  // DD/MM/YYYY (MotHistoryData)
  const parts = String(dateString).split('/')
  if (parts.length === 3) {
    const ms = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime()
    return isNaN(ms) ? '' : ms
  }
  // ISO (VehicleData)
  const ms = new Date(dateString).getTime()
  return isNaN(ms) ? '' : ms
}

// HubSpot "date" properties must be a millisecond timestamp at MIDNIGHT UTC.
// A bare year like 2023 fails with INVALID_DATE, so build Jan 1st @ 00:00 UTC.
const yearToMidnightUtc = (year) => {
  if (!year) return ''
  const y = parseInt(year, 10)
  if (isNaN(y)) return ''
  return Date.UTC(y, 0, 1)
}

// Pull the bike objectId out of whatever shape HubSpot sends.
const extractObjectId = (payload) => {
  if (!payload) return null

  // Webhooks API subscription -> array of events
  if (Array.isArray(payload)) {
    return payload[0]?.objectId || payload[0]?.['hs_object_id'] || null
  }

  // Workflow "Send a webhook" action -> single object
  return (
    payload.objectId ||
    payload.vid ||
    payload.object?.objectId ||
    payload.properties?.hs_object_id?.value ||
    payload.properties?.hs_object_id ||
    null
  )
}

// Fetch + assemble every vehicle property we want to write onto the bike.
const buildVehicleProps = async (registration) => {
  const props = {}

  // 1) Core vehicle data
  const vehicleResponse = await axios.get(
    'https://uk1.ukvehicledata.co.uk/api/datapackage/VehicleData',
    {
      params: {
        auth_apikey:   UKVD_API_KEY,
        key_VRM:       registration,
        api_nullitems: 1
      }
    }
  )

  const data = vehicleResponse.data.Response.DataItems

  console.log('[UK API][VehicleData] Raw response for ' + registration + ':', JSON.stringify({
    Make:                  data.ClassificationDetails?.Smmt?.Make,
    Range:                 data.ClassificationDetails?.Smmt?.Range,
    ModelVariant:          data.SmmtDetails?.ModelVariant,
    YearOfManufacture:     data.VehicleRegistration?.YearOfManufacture,
    EngineCapacity:        data.VehicleRegistration?.EngineCapacity,
    Colour:                data.VehicleRegistration?.Colour,
    DateFirstRegisteredUk: data.VehicleRegistration?.DateFirstRegisteredUk,
    NumberOfPreviousKeepers: data.VehicleHistory?.NumberOfPreviousKeepers
  }, null, 2))

  props.make            = data.ClassificationDetails?.Smmt?.Make      || ''
  props.model           = data.ClassificationDetails?.Smmt?.Range     || ''
  props.trim            = data.SmmtDetails?.ModelVariant               || ''
  props.year            = yearToMidnightUtc(data.VehicleRegistration?.YearOfManufacture)
  props.engine_capacity = data.VehicleRegistration?.EngineCapacity     ? String(data.VehicleRegistration.EngineCapacity)    : ''
  props.colour          = data.VehicleRegistration?.Colour            || ''

  props.date_first_registered_uk = toTimestamp(data.VehicleRegistration?.DateFirstRegisteredUk)
  props.keeper_changes_count     = data.VehicleHistory?.NumberOfPreviousKeepers ?? ''

  // 2) MOT history
  try {
    const motResponse = await axios.get(
      'https://uk1.ukvehicledata.co.uk/api/datapackage/MotHistoryData',
      {
        params: {
          auth_apikey:   UKVD_API_KEY,
          key_VRM:       registration,
          api_nullitems: 1
        }
      }
    )

    const motData    = motResponse.data.Response.DataItems
    const recordList = motData.MotHistory?.RecordList || []
    const lastMot    = recordList[0] || {}
    const advisories = lastMot.AdvisoryNoticeList || []

    console.log('[UK API][MotHistoryData] Raw response for ' + registration + ':', JSON.stringify({
      RecordCount:    motData.MotHistory?.RecordCount,
      NextMotDueDate: motData.VehicleStatus?.NextMotDueDate,
      TestDate:       lastMot.TestDate,
      ExpiryDate:     lastMot.ExpiryDate,
      OdometerReading: lastMot.OdometerReading,
      TestResult:     lastMot.TestResult,
      AdvisoryNoticeList: advisories
    }, null, 2))

    props.mot_count            = motData.MotHistory?.RecordCount        ?? ''
    props.last_mot_date        = toTimestamp(lastMot.TestDate)
    props.last_mot_expiry_date = toTimestamp(lastMot.ExpiryDate)
    props.next_mot_due_date    = toTimestamp(motData.VehicleStatus?.NextMotDueDate)
    props.last_mot_mileage     = lastMot.OdometerReading               ?? ''
    props.last_mot_results     = lastMot.TestResult                    || ''
    props.advisory_notes       = advisories.join('; ')
  } catch (motError) {
    console.log('[hubspot-webhook] MOT fetch failed (non-fatal):', motError.message)
  }

  // 3) Brego valuation (Sandbox)
  try {
    const bregoResponse = await axios.get(
      'https://sandbox.api.brego.io/v1/vehicles/vrm/' + registration + '/valuations',
      {
        params:  { countryCode: 'gb' },
        headers: { 'X-API-Key': BREGO_API_KEY }
      }
    )

    const bregoData = bregoResponse.data
    const bregoValuation = bregoData?.items?.[0]

    console.log('[Brego][Valuations] retail average:', bregoValuation?.retail?.average, '| trade average:', bregoValuation?.trade?.average)

    props.brego_retail_average = bregoValuation?.retail?.average ?? ''
    props.brego_trade_average  = bregoValuation?.trade?.average  ?? ''

    // Human-readable pricing summary (no tags / no JSON) for the client to read
    const currency = (bregoData?.currencyCode || '£').toUpperCase()
    const mileageUnit = bregoData?.mileageUnit || 'mi'
    const money = (value) =>
      (value === undefined || value === null) ? 'N/A' : currency + ' ' + Number(value).toLocaleString('en-GB')

    const fullPricingLines = [
      'VEHICLE VALUATION',
      '',
      'Retail price :',
      '  Low:     ' + money(bregoValuation?.retail?.low),
      '  Average: ' + money(bregoValuation?.retail?.average),
      '  High:    ' + money(bregoValuation?.retail?.high),
      '',
      'Trade price :',
      '  Low:     ' + money(bregoValuation?.trade?.low),
      '  Average: ' + money(bregoValuation?.trade?.average),
      '  High:    ' + money(bregoValuation?.trade?.high),
      '',
      'Based on mileage: ' + (bregoValuation?.mileage != null ? Number(bregoValuation.mileage).toLocaleString('en-GB') + ' ' + mileageUnit : 'N/A'),
      'Valuation date:    ' + (bregoValuation?.date || 'N/A')
    ]

    props.brego_full_pricing = fullPricingLines.join('\n')
  } catch (bregoError) {
    console.log('[hubspot-webhook] Brego fetch failed (non-fatal):', bregoError.message)
    console.log('[Brego][Error] status:', bregoError.response?.status)
    console.log('[Brego][Error] data:', JSON.stringify(bregoError.response?.data, null, 2))
    console.log('[Brego][Error] key present:', !!BREGO_API_KEY, '| key length:', BREGO_API_KEY ? BREGO_API_KEY.length : 0)
  }

  return props
}

// ---------------------------------------------------------------------------
// HUBSPOT WEBHOOK  ->  enrich bike object directly
// ---------------------------------------------------------------------------

app.post('/hubspot-webhook', async (req, res) => {

  // Always ack fast so HubSpot does not retry / time out.
  res.status(200).json({ received: true })

  try {

    console.log('[hubspot-webhook] Payload received:', JSON.stringify(req.body, null, 2))

    const bikeId = extractObjectId(req.body)

    if (!bikeId) {
      console.log('[hubspot-webhook] No objectId found in payload - skipping')
      return
    }

    console.log('[hubspot-webhook] bikeId:', bikeId)

    // 1) Read the bike object to get registration + mileage
    const bikeResponse = await axios.get(
      'https://api.hubapi.com/crm/v3/objects/' + BIKE_OBJECT_TYPE + '/' + bikeId +
        '?properties=vehicle_registration,mileage',
      { headers: hubspotHeaders }
    )

    const registration = bikeResponse.data.properties?.vehicle_registration
    const mileage      = bikeResponse.data.properties?.mileage

    console.log('[hubspot-webhook] registration:', registration, '| mileage:', mileage)

    if (!registration) {
      console.log('[hubspot-webhook] Bike has no vehicle_registration - skipping enrichment')
      return
    }

    // 2) Fetch all vehicle + MOT data
    const vehicleProps = await buildVehicleProps(registration)

    console.log('[hubspot-webhook] Vehicle props to write:', JSON.stringify(vehicleProps, null, 2))

    // 3) Write everything back onto the SAME bike object
    const patchResponse = await axios.patch(
      'https://api.hubapi.com/crm/v3/objects/' + BIKE_OBJECT_TYPE + '/' + bikeId,
      { properties: vehicleProps },
      { headers: hubspotHeaders }
    )

    console.log('[hubspot-webhook] Bike updated OK:', patchResponse.data.id)

  } catch (error) {
    console.log('[hubspot-webhook] ERROR status:', error.response?.status)
    console.log('[hubspot-webhook] ERROR data:', JSON.stringify(error.response?.data, null, 2))
    console.log('[hubspot-webhook] ERROR message:', error.message)
  }

})

// ---------------------------------------------------------------------------

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log('Server running on port ' + PORT)
  console.log('HUBSPOT_TOKEN set:', !!process.env.HUBSPOT_TOKEN)
})
