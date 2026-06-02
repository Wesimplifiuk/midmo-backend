const express  = require('express')
const cors     = require('cors')
const axios    = require('axios')
const multer   = require('multer')
const FormData = require('form-data')

const app    = express()
const upload = multer({ storage: multer.memoryStorage() })

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

// VEHICLE LOOKUP

app.post('/vehicle', async (req, res) => {

  try {

    const { registration } = req.body

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

    return res.json({
      success: true,
      vehicle: {
        make:       data.ClassificationDetails?.Smmt?.Make      || '',
        model:      data.ClassificationDetails?.Smmt?.Range     || '',
        variant:    data.SmmtDetails?.ModelVariant              || '',
        year:       data.VehicleRegistration?.YearOfManufacture || '',
        engineSize: data.VehicleRegistration?.EngineCapacity    || '',
        colour:     data.VehicleRegistration?.Colour            || ''
      }
    })

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
          { name: '2-145432491/colour',               value: colour }
        ],
        legalConsentOptions: {
          consent: {
            consentToProcess: true,
            text: 'I agree to allow midmo ltd to store and process my personal data.',
            communications: [
              {
                value: true,
                subscriptionTypeId: 145536792,
                text: 'I agree to receive other communications from midmo ltd.'
              }
            ]
          }
        },
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
    console.log('[update-bike] Body received:', JSON.stringify({
      bikeId,
      vehicle_registration,
      motorcycle_condition,
      do_you_have_the_keys_and_v5,
      do_you_know_how_much_you_are_looking_for_,
      when_are_you_looking_to_sell_your_bike,
      bike_owner_postal_code
    }, null, 2))

    // Fetch vehicle API data to populate missing fields
    let vehicleApiProps = {}

    if (vehicle_registration) {

      try {

        console.log('[update-bike] Fetching vehicle data for:', vehicle_registration)

        const vehicleResponse = await axios.get(
          'https://uk1.ukvehicledata.co.uk/api/datapackage/VehicleData',
          {
            params: {
              auth_apikey:   '85F49083-9EB4-4C88-9C63-3DC40B79A30B',
              key_VRM:       vehicle_registration,
              api_nullitems: 1
            }
          }
        )

        const data = vehicleResponse.data.Response.DataItems

        console.log('[update-bike] Raw VehicleRegistration:', JSON.stringify(data.VehicleRegistration, null, 2))
        console.log('[update-bike] Raw VehicleHistory:', JSON.stringify(data.VehicleHistory, null, 2))

        // Second call - MotHistoryData package
        const motResponse = await axios.get(
          'https://uk1.ukvehicledata.co.uk/api/datapackage/MotHistoryData',
          {
            params: {
              auth_apikey:   '85F49083-9EB4-4C88-9C63-3DC40B79A30B',
              key_VRM:       vehicle_registration,
              api_nullitems: 1
            }
          }
        )

        const motData   = motResponse.data.Response.DataItems
        const recordList = motData.MotHistory?.RecordList || []
        const lastMot    = recordList[0] || {}

        console.log('[update-bike] Raw MotHistory.RecordCount:', motData.MotHistory?.RecordCount)
        console.log('[update-bike] Raw RecordList count:', recordList.length)
        console.log('[update-bike] Raw lastMot:', JSON.stringify(lastMot, null, 2))

        const toTimestamp = (dateString) => {
          if (!dateString) return ''
          // Handle DD/MM/YYYY format from MotHistoryData
          const parts = dateString.split('/')
          if (parts.length === 3) {
            const ms = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime()
            return isNaN(ms) ? '' : ms
          }
          // Handle ISO format from VehicleData
          const ms = new Date(dateString).getTime()
          return isNaN(ms) ? '' : ms
        }

        const advisories = lastMot.AdvisoryNoticeList || []

        vehicleApiProps = {
          date_first_registered_uk: toTimestamp(data.VehicleRegistration?.DateFirstRegisteredUk),
          keeper_changes_count:     data.VehicleHistory?.NumberOfPreviousKeepers   ?? '',
          mot_count:                motData.MotHistory?.RecordCount                ?? '',
          last_mot_date:            toTimestamp(lastMot.TestDate),
          last_mot_expiry_date:     toTimestamp(lastMot.ExpiryDate),
          next_mot_due_date:        toTimestamp(motData.VehicleStatus?.NextMotDueDate),
          last_mot_mileage:         lastMot.OdometerReading                        ?? '',
          last_mot_results:         lastMot.TestResult                             || '',
          advisory_notes:           advisories.join('; ')
        }

        console.log('[update-bike] vehicleApiProps to be sent:', JSON.stringify(vehicleApiProps, null, 2))

      } catch (vehicleError) {

        console.log('[update-bike] Vehicle API fetch failed (non-fatal):', vehicleError.message)

      }

    } else {

      console.log('[update-bike] WARNING: vehicle_registration not received - skipping vehicle API fetch')

    }

    const hubspotPayload = {
      motorcycle_condition:                      motorcycle_condition,
      do_you_have_the_keys_and_v5:               do_you_have_the_keys_and_v5,
      do_you_know_how_much_you_are_looking_for_: do_you_know_how_much_you_are_looking_for_,
      when_are_you_looking_to_sell_your_bike:    when_are_you_looking_to_sell_your_bike,
      bike_owner_postal_code:                    bike_owner_postal_code,
      ...vehicleApiProps
    }

    console.log('[update-bike] Final HubSpot payload:', JSON.stringify(hubspotPayload, null, 2))

    const response = await axios.patch(
      'https://api.hubapi.com/crm/v3/objects/2-145432491/' + bikeId,
      { properties: hubspotPayload },
      { headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.HUBSPOT_TOKEN } }
    )

    console.log('[update-bike] HubSpot response:', JSON.stringify(response.data, null, 2))

    return res.json({ success: true, data: response.data })

  } catch (error) {

    console.log('[update-bike] ERROR status:', error.response?.status)
    console.log('[update-bike] ERROR data:', JSON.stringify(error.response?.data, null, 2))
    return res.status(500).json({ success: false, error: error.response?.data || error.message })

  }

})

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

    for (var i = 0; i < req.files.length; i++) {

      var file         = req.files[i]
      var ext          = file.originalname.split('.').pop().toLowerCase()
      var safeFilename = safeReg + '-photo-' + (i + 1) + '.' + ext

      console.log('[upload-photos] Uploading file:', safeFilename, 'size:', file.size)

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
          }
        }
      )

      console.log('[upload-photos] File uploaded:', JSON.stringify(uploadResponse.data, null, 2))

      uploadedUrls.push(uploadResponse.data.url)

    }

    console.log('[upload-photos] All files uploaded. URLs:', uploadedUrls)

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

    console.log('[upload-photos] Final photos value:', photosValue)

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
    console.log('[upload-photos] ERROR message:', error.message)
    return res.status(500).json({ success: false, error: error.response?.data || error.message })

  }

})

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log('Server running on port ' + PORT)
  console.log('HUBSPOT_TOKEN set:', !!process.env.HUBSPOT_TOKEN)
})
