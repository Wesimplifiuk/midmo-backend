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

const UKVD_API_KEY = process.env.UKVD_API_KEY
const BREGO_API_KEY = process.env.BREGO_API_KEY

const hubspotHeaders = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer ' + process.env.HUBSPOT_TOKEN
}

// ---------------------------------------------------------------------------
// HEALTH
// ---------------------------------------------------------------------------

app.get('/', (req, res) => {
  res.send('Midmo Bike API running')
})

app.get('/check-env', (req, res) => {
  res.json({
    hubspotToken: !!process.env.HUBSPOT_TOKEN,
    ukvdApiKey: !!UKVD_API_KEY,
    bregoApiKey: !!BREGO_API_KEY
  })
})

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

const extractObjectId = (payload) => {
  if (!payload) return null

  if (Array.isArray(payload)) {
    return (
      payload[0]?.objectId ||
      payload[0]?.hs_object_id ||
      null
    )
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

const toTimestamp = (dateString) => {
  if (!dateString) return ''

  const parts = String(dateString).split('/')

  // DD/MM/YYYY
  if (parts.length === 3) {
    const ms = new Date(
      `${parts[2]}-${parts[1]}-${parts[0]}`
    ).getTime()

    return isNaN(ms) ? '' : ms
  }

  // ISO
  const ms = new Date(dateString).getTime()

  return isNaN(ms) ? '' : ms
}

const yearToMidnightUtc = (year) => {
  if (!year) return ''

  const y = parseInt(year, 10)

  if (isNaN(y)) return ''

  return Date.UTC(y, 0, 1)
}

// ---------------------------------------------------------------------------
// HUBSPOT HELPERS
// ---------------------------------------------------------------------------

const getBike = async (bikeId, properties) => {
  const response = await axios.get(
    `https://api.hubapi.com/crm/v3/objects/${BIKE_OBJECT_TYPE}/${bikeId}`,
    {
      params: {
        properties: properties.join(',')
      },
      headers: hubspotHeaders
    }
  )

  return response.data
}

const updateBike = async (bikeId, properties) => {
  const response = await axios.patch(
    `https://api.hubapi.com/crm/v3/objects/${BIKE_OBJECT_TYPE}/${bikeId}`,
    {
      properties
    },
    {
      headers: hubspotHeaders
    }
  )

  return response.data
}

// ===========================================================================
// BREGO
// ===========================================================================

const buildBregoProps = async (registration) => {
  const props = {}

  const response = await axios.get(
    `https://api.brego.io/v1/vehicles/vrm/${encodeURIComponent(registration)}/valuations`,
    {
      params: {
        countryCode: 'gb'
      },
      headers: {
        'X-API-Key': BREGO_API_KEY
      }
    }
  )

  const bregoData = response.data
  const valuation = bregoData?.items?.[0]

  console.log(
    '[Brego] registration:',
    registration,
    '| retail:',
    valuation?.retail?.average,
    '| trade:',
    valuation?.trade?.average
  )

  props.brego_retail_average =
    valuation?.retail?.average ?? ''

  props.brego_trade_average =
    valuation?.trade?.average ?? ''

  const currency =
    (bregoData?.currencyCode || 'gbp').toUpperCase()

  const mileageUnit =
    bregoData?.mileageUnit || 'mi'

  const money = (value) => {
    if (value === undefined || value === null) {
      return 'N/A'
    }

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
    'Valuation date:    ' +
      (valuation?.date || 'N/A')
  ]

  props.brego_full_pricing =
    fullPricingLines.join('\n')

  return props
}

// ---------------------------------------------------------------------------
// BREGO WEBHOOK
// Keep your existing URL
// ---------------------------------------------------------------------------

app.post('/hubspot-webhook', async (req, res) => {

  res.status(200).json({
    received: true,
    endpoint: 'brego'
  })

  try {
    console.log(
      '[BREGO WEBHOOK] Payload:',
      JSON.stringify(req.body, null, 2)
    )

    const bikeId = extractObjectId(req.body)

    if (!bikeId) {
      console.log('[BREGO WEBHOOK] No bikeId found')
      return
    }

    const bike = await getBike(
      bikeId,
      [
        'vehicle_registration',
        'mileage'
      ]
    )

    const registration =
      bike.properties?.vehicle_registration

    const mileage =
      bike.properties?.mileage

    console.log(
      '[BREGO WEBHOOK]',
      'bikeId:',
      bikeId,
      '| registration:',
      registration,
      '| mileage:',
      mileage
    )

    if (!registration) {
      console.log(
        '[BREGO WEBHOOK] No registration. Skipping.'
      )
      return
    }

    const props =
      await buildBregoProps(registration)

    console.log(
      '[BREGO WEBHOOK] Updating:',
      JSON.stringify(props, null, 2)
    )

    await updateBike(
      bikeId,
      props
    )

    console.log(
      '[BREGO WEBHOOK] Bike updated successfully:',
      bikeId
    )

  } catch (error) {
    console.log(
      '[BREGO WEBHOOK] ERROR status:',
      error.response?.status
    )

    console.log(
      '[BREGO WEBHOOK] ERROR data:',
      JSON.stringify(error.response?.data, null, 2)
    )

    console.log(
      '[BREGO WEBHOOK] ERROR message:',
      error.message
    )
  }
})

// ===========================================================================
// UK VEHICLE DATA + MOT
// ===========================================================================

const buildUkVehicleProps = async (registration) => {
  const props = {}

  // -------------------------------------------------------------------------
  // VehicleData
  // -------------------------------------------------------------------------

  const vehicleResponse = await axios.get(
    'https://uk1.ukvehicledata.co.uk/api/datapackage/VehicleData',
    {
      params: {
        auth_apikey: UKVD_API_KEY,
        key_VRM: registration,
        api_nullitems: 1
      }
    }
  )

  const data =
    vehicleResponse.data.Response.DataItems

  console.log(
    '[UKVD][VehicleData]',
    JSON.stringify({
      Make:
        data.ClassificationDetails?.Smmt?.Make,

      Range:
        data.ClassificationDetails?.Smmt?.Range,

      ModelVariant:
        data.SmmtDetails?.ModelVariant,

      YearOfManufacture:
        data.VehicleRegistration?.YearOfManufacture,

      EngineCapacity:
        data.VehicleRegistration?.EngineCapacity,

      Colour:
        data.VehicleRegistration?.Colour,

      DateFirstRegisteredUk:
        data.VehicleRegistration?.DateFirstRegisteredUk,

      NumberOfPreviousKeepers:
        data.VehicleHistory?.NumberOfPreviousKeepers
    }, null, 2)
  )

  props.make =
    data.ClassificationDetails?.Smmt?.Make || ''

  props.model =
    data.ClassificationDetails?.Smmt?.Range || ''

  props.trim =
    data.SmmtDetails?.ModelVariant || ''

  props.year =
    yearToMidnightUtc(
      data.VehicleRegistration?.YearOfManufacture
    )

  props.engine_capacity =
    data.VehicleRegistration?.EngineCapacity
      ? String(data.VehicleRegistration.EngineCapacity)
      : ''

  props.colour =
    data.VehicleRegistration?.Colour || ''

  props.date_first_registered_uk =
    toTimestamp(
      data.VehicleRegistration?.DateFirstRegisteredUk
    )

  props.keeper_changes_count =
    data.VehicleHistory?.NumberOfPreviousKeepers ?? ''

  // -------------------------------------------------------------------------
  // MOT
  // -------------------------------------------------------------------------

  try {
    const motResponse = await axios.get(
      'https://uk1.ukvehicledata.co.uk/api/datapackage/MotHistoryData',
      {
        params: {
          auth_apikey: UKVD_API_KEY,
          key_VRM: registration,
          api_nullitems: 1
        }
      }
    )

    const motData =
      motResponse.data.Response.DataItems

    const recordList =
      motData.MotHistory?.RecordList || []

    const lastMot =
      recordList[0] || {}

    const advisories =
      lastMot.AdvisoryNoticeList || []

    console.log(
      '[UKVD][MOT]',
      JSON.stringify({
        RecordCount:
          motData.MotHistory?.RecordCount,

        NextMotDueDate:
          motData.VehicleStatus?.NextMotDueDate,

        TestDate:
          lastMot.TestDate,

        ExpiryDate:
          lastMot.ExpiryDate,

        OdometerReading:
          lastMot.OdometerReading,

        TestResult:
          lastMot.TestResult,

        AdvisoryNoticeList:
          advisories
      }, null, 2)
    )

    props.mot_count =
      motData.MotHistory?.RecordCount ?? ''

    props.last_mot_date =
      toTimestamp(lastMot.TestDate)

    props.last_mot_expiry_date =
      toTimestamp(lastMot.ExpiryDate)

    props.next_mot_due_date =
      toTimestamp(
        motData.VehicleStatus?.NextMotDueDate
      )

    props.last_mot_mileage =
      lastMot.OdometerReading ?? ''

    props.last_mot_results =
      lastMot.TestResult || ''

    props.advisory_notes =
      advisories.join('; ')

  } catch (motError) {
    console.log(
      '[UKVD][MOT] Fetch failed but continuing:',
      motError.message
    )
  }

  return props
}

// ---------------------------------------------------------------------------
// UKVD CREATE WEBHOOK
// ---------------------------------------------------------------------------

app.post('/hubspot-uk-create', async (req, res) => {

  res.status(200).json({
    received: true,
    endpoint: 'ukvd-create'
  })

  try {
    console.log(
      '[UKVD CREATE] Payload:',
      JSON.stringify(req.body, null, 2)
    )

    const bikeId = extractObjectId(req.body)

    if (!bikeId) {
      console.log('[UKVD CREATE] No bikeId found')
      return
    }

    const bike = await getBike(
      bikeId,
      ['vehicle_registration']
    )

    const registration =
      bike.properties?.vehicle_registration

    console.log(
      '[UKVD CREATE]',
      'bikeId:',
      bikeId,
      '| registration:',
      registration
    )

    if (!registration) {
      console.log(
        '[UKVD CREATE] No registration. Skipping.'
      )
      return
    }

    const props =
      await buildUkVehicleProps(registration)

    console.log(
      '[UKVD CREATE] Updating:',
      JSON.stringify(props, null, 2)
    )

    await updateBike(
      bikeId,
      props
    )

    console.log(
      '[UKVD CREATE] Bike updated successfully:',
      bikeId
    )

  } catch (error) {
    console.log(
      '[UKVD CREATE] ERROR status:',
      error.response?.status
    )

    console.log(
      '[UKVD CREATE] ERROR data:',
      JSON.stringify(error.response?.data, null, 2)
    )

    console.log(
      '[UKVD CREATE] ERROR message:',
      error.message
    )
  }
})

// ---------------------------------------------------------------------------
// SERVER
// ---------------------------------------------------------------------------

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(
    'Server running on port ' + PORT
  )

  console.log(
    'HUBSPOT_TOKEN set:',
    !!process.env.HUBSPOT_TOKEN
  )

  console.log(
    'UKVD_API_KEY set:',
    !!UKVD_API_KEY
  )

  console.log(
    'BREGO_API_KEY set:',
    !!BREGO_API_KEY
  )
})