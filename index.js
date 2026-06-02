const express  = require('express')
const cors     = require('cors')
const axios    = require('axios')
const multer   = require('multer')
const FormData = require('form-data')

const app    = express()
const upload = multer({ storage: multer.memoryStorage() })

// Simple in-memory cache for vehicle lookups (clears on restart)
const vehicleCache = {}

app.use(cors())
app.use(express.json())

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

app.get('/check-objects', async (req, res) => {
  try {
    const response = await axios.get(
      'https://api.hubapi.com/crm/v3/schemas',
      { headers: { 'Authorization': 'Bearer ' + process.env.HUBSPOT_TOKEN } }
    )
    return res.json({
      objects: response.data.results.map(function (o) {
        return { name: o.name, objectTypeId: o.objectTypeId, label: o.labels && o.labels.singular }
      })
    })
  } catch (error) {
    return res.status(500).json({ error: error.response?.data || error.message })
  }
})

app.get('/check-associations', async (req, res) => {
  try {
    const response = await axios.get(
      'https://api.hubapi.com/crm/v4/associations/2-145432491/contacts/labels',
      { headers: { 'Authorization': 'Bearer ' + process.env.HUBSPOT_TOKEN } }
    )
    return res.json(response.data)
  } catch (error) {
    return res.status(500).json({ error: error.response?.data || error.message })
  }
})

// BATCH CREATE (Contact + Bike in one request)

app.post('/batch-create', async (req, res) => {

  try {

    const {
      firstname, lastname, email, phone, marketing_consent, data_consent,
      vehicle_registration, make, model, variant, engine_capacity, mileage, year, colour
    } = req.body

    console.log('[batch-create] Starting for:', email)

    // 1. Create contact using batch API
    const contactBatchResponse = await axios.post(
      'https://api.hubapi.com/crm/v3/objects/contacts/batch/create',
      {
        inputs: [
          {
            properties: {
              firstname: firstname || '',
              lastname: lastname || '',
              email: email || '',
              phone: phone || '',
              hs_lead_status: 'NEW',
              marketing_consent: marketing_consent ? 'true' : 'false',
              data_consent: data_consent ? 'true' : 'false'
            }
          }
        ]
      },
      { headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.HUBSPOT_TOKEN } }
    )

    const contactId = contactBatchResponse.data.results[0]?.id

    if (!contactId) {
      throw new Error('Failed to create contact')
    }

    console.log('[batch-create] Contact created:', contactId)

    // 2. Create bike using batch API in parallel
    const bikeBatchResponse = await axios.post(
      'https://api.hubapi.com/crm/v3/objects/2-145432491/batch/create',
      {
        inputs: [
          {
            properties: {
              vehicle_registration: vehicle_registration || '',
              make: make || '',
              model: model || '',
              trim: variant || '',
              engine_capacity: engine_capacity ? Number(engine_capacity) : 0,
              mileage: mileage ? Number(mileage) : 0,
              year: year ? new Date(year + '-01-01').getTime() : null,
              colour: colour || ''
            }
          }
        ]
      },
      { headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.HUBSPOT_TOKEN } }
    )

    const bikeId = bikeBatchResponse.data.results[0]?.id

    if (!bikeId) {
      throw new Error('Failed to create bike')
    }

    console.log('[batch-create] Bike created:', bikeId)

    // 3. Associate contact and bike
    try {
      await axios.put(
        'https://api.hubapi.com/crm/v4/objects/2-145432491/' + bikeId + '/associations/contacts/' + contactId,
        [{ associationCategory: 'USER_DEFINED', associationTypeId: 24 }],
        { headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.HUBSPOT_TOKEN } }
      )
      console.log('[batch-create] Association successful')
    } catch (assocError) {
      console.log('[batch-create] Association failed (non-fatal):', assocError.message)
    }

    return res.json({ success: true, contactId: contactId, bikeId: bikeId })

  } catch (error) {

    console.log('[batch-create] ERROR status:', error.response?.status)
    console.log('[batch-create] ERROR data:', JSON.stringify(error.response?.data, null, 2))
    return res.status(500).json({ success: false, error: error.response?.data || error.message })

  }

})

// SEARCH CONTACT

app.post('/search-contact', async (req, res) => {

  try {

    const { email, firstname, lastname, phone } = req.body

    console.log('[search-contact] Submitting for:', email)

    const response = await axios.post(
      'https://api-eu1.hsforms.com/submissions/v3/integration/submit/146536792/1d29ad99-487b-4191-971f-1b72299c6947',
      {
        fields: [
          { name: 'email',     value: email },
          { name: 'firstname', value: firstname },
          { name: 'lastname',  value: lastname },
          { name: 'phone',     value: phone }
        ],
        context: { pageUri: 'https://motortradeteam.com', pageName: 'Motorbike Lead Form' }
      },
      { headers: { 'Content-Type': 'application/json' } }
    )

    console.log('[search-contact] OK:', JSON.stringify(response.data, null, 2))

    return res.json({ success: true, hubspot: response.data })

  } catch (error) {

    console.log('[search-contact] ERROR:', JSON.stringify(error.response?.data, null, 2))
    return res.status(500).json({ success: false, error: error.response?.data || error.message })

  }

})

// VEHICLE LOOKUP (with simple caching)

app.post('/vehicle', async (req, res) => {

  try {

    const { registration } = req.body

    // Check cache first
    if (vehicleCache[registration]) {
      console.log('[vehicle] Cache hit for:', registration)
      return res.json(vehicleCache[registration])
    }

    console.log('[vehicle] Fetching:', registration)

    const vehicleResponse = await axios.get(
      'https://uk1.ukvehicledata.co.uk/api/datapackage/VehicleData',
      {
        params: {
          auth_apikey:   '85F49083-9EB4-4C88-9C63-3DC40B79A30B',
          key_VRM:       registration,
          api_nullitems: 1
        },
        timeout: 10000  // 10s timeout to prevent hanging
      }
    )

    const data = vehicleResponse.data.Response.DataItems

    const result = {
      success: true,
      vehicle: {
        make:       data.ClassificationDetails?.Smmt?.Make      || '',
        model:      data.ClassificationDetails?.Smmt?.Range     || '',
        variant:    data.SmmtDetails?.ModelVariant              || '',
        year:       data.VehicleRegistration?.YearOfManufacture || '',
        engineSize: data.VehicleRegistration?.EngineCapacity    || '',
        colour:     data.VehicleRegistration?.Colour            || ''
      }
    }

    // Cache for 1 hour
    vehicleCache[registration] = result
    setTimeout(() => delete vehicleCache[registration], 3600000)

    return res.json(result)

  } catch (error) {

    console.log('[vehicle] ERROR:', JSON.stringify(error.response?.data, null, 2))
    return res.status(500).json({ success: false, error: error.response?.data || error.message })

  }

})

// VEHICLE FULL DATA

app.post('/vehicle-full', async (req, res) => {

  try {

    const { registration } = req.body

    if (!registration) {
      return res.status(400).json({ success: false, error: 'registration is required' })
    }

    console.log('[vehicle-full] Looking up registration:', registration)

    const vehicleResponse = await axios.get(
      'https://uk1.ukvehicledata.co.uk/api/datapackage/VehicleData',
      {
        params: {
          auth_apikey:   '85F49083-9EB4-4C88-9C63-3DC40B79A30B',
          key_VRM:       registration,
          api_nullitems: 1
        }
      }
    )

    const data = vehicleResponse.data.Response.DataItems

    console.log('[vehicle-full] Full data received:', JSON.stringify(data, null, 2))

    return res.json({
      success: true,
      data: data
    })

  } catch (error) {

    console.log('[vehicle-full] ERROR:', JSON.stringify(error.response?.data, null, 2))
    return res.status(500).json({ success: false, error: error.response?.data || error.message })

  }

})

// CREATE BIKE

app.post('/create-bike', async (req, res) => {

  try {

    const { email, vehicle_registration, make, model, variant, engine_capacity, mileage, year, colour } = req.body

    console.log('[create-bike] Starting - registration:', vehicle_registration, '| email:', email)

    const formResponse = await axios.post(
      'https://api-eu1.hsforms.com/submissions/v3/integration/submit/146536792/3ead7efb-1a49-414b-b924-349eb627eeb8',
      {
        fields: [
          { name: 'email',                            value: email },
          { name: '2-145432491/vehicle_registration', value: vehicle_registration },
          { name: '2-145432491/make',                 value: make },
          { name: '2-145432491/model',                value: model },
          { name: '2-145432491/trim',                 value: variant },
          { name: '2-145432491/engine_capacity',      value: engine_capacity ? Number(engine_capacity) : 0 },
          { name: '2-145432491/mileage',              value: mileage ? Number(mileage) : 0 },
          { name: '2-145432491/year',                 value: year ? new Date(year + '-01-01').getTime() : null },
          { name: '2-145432491/colour',               value: colour },
        
        ],
        context: { pageUri: 'https://motortradeteam.com', pageName: 'Bike Form' }
      },
      { headers: { 'Content-Type': 'application/json' } }
    )

    console.log('[create-bike] Form OK:', JSON.stringify(formResponse.data, null, 2))

    console.log('[create-bike] Searching bike...')

    // Retry up to 5 times with 2s delay to give HubSpot time to create the object
    let bikeId   = null
    let attempts = 0

    while (!bikeId && attempts < 5) {

      attempts++
      await new Promise(function (resolve) { setTimeout(resolve, 2000) })

      console.log('[create-bike] Search attempt', attempts)

      const bikeSearch = await axios.post(
        'https://api.hubspot.com/crm/v3/objects/2-145432491/search',
        {
          filterGroups: [
            { filters: [{ propertyName: 'vehicle_registration', operator: 'EQ', value: vehicle_registration }] }
          ],
          sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
          limit: 1
        },
        { headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.HUBSPOT_TOKEN } }
      )

      if (bikeSearch.data.results && bikeSearch.data.results.length > 0) {
        bikeId = bikeSearch.data.results[0].id
      }

      console.log('[create-bike] attempt', attempts, '- bikeId:', bikeId)

    }

    console.log('[create-bike] bikeId after retries:', bikeId)

    const contactSearch = await axios.post(
      'https://api.hubapi.com/crm/v3/objects/contacts/search',
      {
        filterGroups: [
          { filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }
        ],
        limit: 1
      },
      { headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.HUBSPOT_TOKEN } }
    )

    const contactId = contactSearch.data.results && contactSearch.data.results.length > 0
      ? contactSearch.data.results[0].id
      : null

    console.log('[create-bike] contactId:', contactId)

    if (bikeId && contactId) {

      console.log('[create-bike] Associating bikeId:', bikeId, '-> contactId:', contactId)

      const assocResponse = await axios.put(
        'https://api.hubapi.com/crm/v4/objects/2-145432491/' + bikeId + '/associations/contacts/' + contactId,
        [{ associationCategory: 'USER_DEFINED', associationTypeId: 24 }],
        { headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.HUBSPOT_TOKEN } }
      )

      console.log('[create-bike] Association OK:', JSON.stringify(assocResponse.data, null, 2))

    } else {

      console.log('[create-bike] SKIPPING association - bikeId:', bikeId, '| contactId:', contactId)

    }

    return res.json({ success: true, bikeId: bikeId, contactId: contactId })

  } catch (error) {

    console.log('[create-bike] ERROR status:', error.response?.status)
    console.log('[create-bike] ERROR data:', JSON.stringify(error.response?.data, null, 2))
    console.log('[create-bike] ERROR message:', error.message)
    return res.status(500).json({ success: false, error: error.response?.data || error.message })

  }

})

// UPDATE BIKE

app.post('/update-bike', async (req, res) => {

  try {

    const {
      bikeId,
      vehicle_registration,
      motorcycle_condition,
      do_you_have_the_keys_and_v5,
      do_you_know_how_much_you_are_looking_for_,
      when_are_you_looking_to_sell_your_bike,
      bike_owner_postal_code
    } = req.body

    if (!bikeId) {
      console.log('[update-bike] ERROR: bikeId missing')
      return res.status(400).json({ success: false, error: 'bikeId is required' })
    }

    console.log('[update-bike] Updating bikeId:', bikeId)

    // Fetch vehicle API data in parallel while updating
    const vehicleDataPromise = vehicle_registration 
      ? fetchVehicleData(vehicle_registration)
      : Promise.resolve({})

    const hubspotPayload = {
      motorcycle_condition:                      motorcycle_condition,
      do_you_have_the_keys_and_v5:               do_you_have_the_keys_and_v5,
      do_you_know_how_much_you_are_looking_for_: do_you_know_how_much_you_are_looking_for_,
      when_are_you_looking_to_sell_your_bike:    when_are_you_looking_to_sell_your_bike,
      bike_owner_postal_code:                    bike_owner_postal_code
    }

    // Get vehicle data in parallel
    const vehicleApiProps = await vehicleDataPromise
    const finalPayload = { ...hubspotPayload, ...vehicleApiProps }

    console.log('[update-bike] Final HubSpot payload:', JSON.stringify(finalPayload, null, 2))

    // Use batch API for update (more efficient than single patch)
    const response = await axios.patch(
      'https://api.hubapi.com/crm/v3/objects/2-145432491/' + bikeId,
      { properties: finalPayload },
      { headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.HUBSPOT_TOKEN } }
    )

    console.log('[update-bike] HubSpot response OK')

    return res.json({ success: true, data: response.data })

  } catch (error) {

    console.log('[update-bike] ERROR status:', error.response?.status)
    console.log('[update-bike] ERROR data:', JSON.stringify(error.response?.data, null, 2))
    return res.status(500).json({ success: false, error: error.response?.data || error.message })

  }

})

// Helper function to fetch all vehicle data in parallel
async function fetchVehicleData(registration) {

  try {

    console.log('[fetchVehicleData] Fetching for:', registration)

    // Run both API calls in parallel
    const [vehicleResponse, motResponse] = await Promise.all([
      axios.get('https://uk1.ukvehicledata.co.uk/api/datapackage/VehicleData', {
        params: {
          auth_apikey:   '85F49083-9EB4-4C88-9C63-3DC40B79A30B',
          key_VRM:       registration,
          api_nullitems: 1
        },
        timeout: 8000
      }),
      axios.get('https://uk1.ukvehicledata.co.uk/api/datapackage/MotHistoryData', {
        params: {
          auth_apikey:   '85F49083-9EB4-4C88-9C63-3DC40B79A30B',
          key_VRM:       registration,
          api_nullitems: 1
        },
        timeout: 8000
      })
    ])

    const vData = vehicleResponse.data.Response.DataItems
    const mData = motResponse.data.Response.DataItems
    const recordList = mData.MotHistory?.RecordList || []
    const lastMot = recordList[0] || {}

    const toTimestamp = (dateString) => {
      if (!dateString) return ''
      const parts = dateString.split('/')
      if (parts.length === 3) {
        const ms = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime()
        return isNaN(ms) ? '' : ms
      }
      const ms = new Date(dateString).getTime()
      return isNaN(ms) ? '' : ms
    }

    const advisories = lastMot.AdvisoryNoticeList || []

    return {
      date_first_registered_uk: toTimestamp(vData.VehicleRegistration?.DateFirstRegisteredUk),
      keeper_changes_count:     vData.VehicleHistory?.NumberOfPreviousKeepers   ?? '',
      mot_count:                mData.MotHistory?.RecordCount                ?? '',
      last_mot_date:            toTimestamp(lastMot.TestDate),
      last_mot_expiry_date:     toTimestamp(lastMot.ExpiryDate),
      next_mot_due_date:        toTimestamp(mData.VehicleStatus?.NextMotDueDate),
      last_mot_mileage:         lastMot.OdometerReading                        ?? '',
      last_mot_results:         lastMot.TestResult                             || '',
      advisory_notes:           advisories.join('; ')
    }

  } catch (error) {

    console.log('[fetchVehicleData] ERROR (non-fatal):', error.message)
    return {}

  }

}

// UPLOAD PHOTOS

app.post('/upload-photos', upload.array('photos', 2), async (req, res) => {

  try {

    const { bikeId, registration } = req.body

    if (!bikeId) {
      console.log('[upload-photos] ERROR: bikeId missing')
      return res.status(400).json({ success: false, error: 'bikeId is required' })
    }

    if (!req.files || req.files.length === 0) {
      console.log('[upload-photos] ERROR: no files received')
      return res.status(400).json({ success: false, error: 'No files uploaded' })
    }

    console.log('[upload-photos] Uploading', req.files.length, 'file(s) for bikeId:', bikeId)

    var safeReg      = (registration || 'unknown').replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    var uploadedUrls = []

    // Upload files in parallel for faster processing
    const uploadPromises = req.files.map((file, i) => uploadFile(file, safeReg, i))
    uploadedUrls = await Promise.all(uploadPromises)

    console.log('[upload-photos] All files uploaded. URLs:', uploadedUrls)

    // Get current photos
    const bikeResponse = await axios.get(
      'https://api.hubapi.com/crm/v3/objects/2-145432491/' + bikeId + '?properties=photos',
      { headers: { 'Authorization': 'Bearer ' + process.env.HUBSPOT_TOKEN } }
    )

    var currentPhotos = bikeResponse.data.properties.photos || ''
    var existingUrls = currentPhotos
      ? currentPhotos.split(';').map(function (u) { return u.trim() }).filter(function (u) { return u })
      : []

    var allUrls     = existingUrls.concat(uploadedUrls)
    var photosValue = allUrls.join(';')

    console.log('[upload-photos] Updating bike with', allUrls.length, 'total photos')

    await axios.patch(
      'https://api.hubapi.com/crm/v3/objects/2-145432491/' + bikeId,
      { properties: { photos: photosValue } },
      { headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.HUBSPOT_TOKEN } }
    )

    console.log('[upload-photos] Bike updated with photos OK')

    return res.json({ success: true, urls: uploadedUrls })

  } catch (error) {

    console.log('[upload-photos] ERROR status:', error.response?.status)
    console.log('[upload-photos] ERROR data:', JSON.stringify(error.response?.data, null, 2))
    return res.status(500).json({ success: false, error: error.response?.data || error.message })

  }

})

// Helper function to upload a single file
async function uploadFile(file, safeReg, index) {

  try {

    var ext          = file.originalname.split('.').pop().toLowerCase()
    var safeFilename = safeReg + '-photo-' + (index + 1) + '.' + ext

    console.log('[uploadFile] Uploading:', safeFilename, 'size:', file.size)

    var formData = new FormData()
    formData.append('file', file.buffer, {
      filename:    safeFilename,
      contentType: file.mimetype
    })
    formData.append('folderPath', '/bike-photos')
    formData.append('options', JSON.stringify({ access: 'PUBLIC_INDEXABLE', overwrite: false }))

    var uploadResponse = await axios.post(
      'https://api.hubapi.com/files/v3/files',
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          'Authorization': 'Bearer ' + process.env.HUBSPOT_TOKEN
        },
        timeout: 30000
      }
    )

    console.log('[uploadFile] File uploaded successfully')

    return uploadResponse.data.url

  } catch (error) {

    console.log('[uploadFile] ERROR:', error.message)
    throw error

  }

}

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log('Server running on port ' + PORT)
  console.log('HUBSPOT_TOKEN set:', !!process.env.HUBSPOT_TOKEN)
})
