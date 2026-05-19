const express = require('express')
const cors = require('cors')
const axios = require('axios')

const app = express()

app.use(cors())
app.use(express.json())

app.get('/', (req, res) => {
  res.send('Bike API running')
})

// CHECK ENV

app.get('/check-env', (req, res) => {
  res.json({
    hasToken: !!process.env.HUBSPOT_TOKEN,
    tokenPrefix: process.env.HUBSPOT_TOKEN
      ? process.env.HUBSPOT_TOKEN.substring(0, 15) + '...'
      : 'NOT SET'
  })
})

// CHECK OBJECTS

app.get('/check-objects', async (req, res) => {
  try {
    const response = await axios.get(
      'https://api.hubapi.com/crm/v3/schemas',
      {
        headers: {
          'Authorization': 'Bearer ' + process.env.HUBSPOT_TOKEN
        }
      }
    )
    return res.json({
      objects: response.data.results.map(function (o) {
        return {
          name: o.name,
          objectTypeId: o.objectTypeId,
          label: o.labels && o.labels.singular
        }
      })
    })
  } catch (error) {
    return res.status(500).json({ error: error.response?.data || error.message })
  }
})

// CHECK ASSOCIATIONS

app.get('/check-associations', async (req, res) => {
  try {
    const response = await axios.get(
      'https://api.hubapi.com/crm/v4/associations/2-145432491/contacts/labels',
      {
        headers: {
          'Authorization': 'Bearer ' + process.env.HUBSPOT_TOKEN
        }
      }
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

    console.log('[search-contact] Submitting contact form for:', email)

    const response = await axios.post(
      'https://api-eu1.hsforms.com/submissions/v3/integration/submit/146536792/1d29ad99-487b-4191-971f-1b72299c6947',
      {
        fields: [
          { name: 'email',     value: email },
          { name: 'firstname', value: firstname },
          { name: 'lastname',  value: lastname },
          { name: 'phone',     value: phone }
        ],
        context: {
          pageUri: 'https://motortradeteam.com',
          pageName: 'Motorbike Lead Form'
        }
      },
      {
        headers: { 'Content-Type': 'application/json' }
      }
    )

    console.log('[search-contact] Form response:', JSON.stringify(response.data, null, 2))

    return res.json({ success: true, hubspot: response.data })

  } catch (error) {

    console.log('[search-contact] ERROR:', JSON.stringify(error.response?.data, null, 2))

    return res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    })

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

    return res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    })

  }

})

// CREATE BIKE

app.post('/create-bike', async (req, res) => {

  try {

    const {
      email,
      vehicle_registration,
      make,
      model,
      variant,
      engine_capacity,
      mileage,
      year,
      colour,
      mot
    } = req.body

    console.log('[create-bike] Starting for registration:', vehicle_registration, 'email:', email)

    // 1. SUBMIT BIKE FORM

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
          { name: '2-145432491/mot',                  value: Array.isArray(mot) ? mot.join(';') : mot }
        ],
        context: {
          pageUri: 'https://motortradeteam.com',
          pageName: 'Bike Form'
        }
      },
      { headers: { 'Content-Type': 'application/json' } }
    )

    console.log('[create-bike] Form submitted OK:', JSON.stringify(formResponse.data, null, 2))

    // DELAY PARA QUE HUBSPOT PROCESE EL FORM

    await new Promise(function (resolve) { setTimeout(resolve, 2000) })

    // 2. BUSCAR BIKE

    console.log('[create-bike] Searching bike by registration:', vehicle_registration)

    const bikeSearch = await axios.post(
      'https://api.hubapi.com/crm/v3/objects/2-145432491/search',
      {
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'vehicle_registration',
                operator: 'EQ',
                value: vehicle_registration
              }
            ]
          }
        ],
        sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
        limit: 1
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + process.env.HUBSPOT_TOKEN
        }
      }
    )

    const bikeId = bikeSearch.data.results && bikeSearch.data.results.length > 0
      ? bikeSearch.data.results[0].id
      : null

    console.log('[create-bike] bikeId:', bikeId)

    // 3. BUSCAR CONTACTO

    console.log('[create-bike] Searching contact by email:', email)

    const contactSearch = await axios.post(
      'https://api.hubapi.com/crm/v3/objects/contacts/search',
      {
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'email',
                operator: 'EQ',
                value: email
              }
            ]
          }
        ],
        limit: 1
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + process.env.HUBSPOT_TOKEN
        }
      }
    )

    const contactId = contactSearch.data.results && contactSearch.data.results.length > 0
      ? contactSearch.data.results[0].id
      : null

    console.log('[create-bike] contactId:', contactId)

    // 4. ASOCIAR BIKE CON CONTACTO

    if (bikeId && contactId) {

      console.log('[create-bike] Associating bikeId:', bikeId, '-> contactId:', contactId)

      // PRIMERO OBTENEMOS EL associationTypeId REAL

      const labelsResponse = await axios.get(
        'https://api.hubapi.com/crm/v4/associations/2-145432491/contacts/labels',
        {
          headers: {
            'Authorization': 'Bearer ' + process.env.HUBSPOT_TOKEN
          }
        }
      )

      console.log('[create-bike] Available association labels:', JSON.stringify(labelsResponse.data, null, 2))

      const labels = labelsResponse.data.results
      const assocTypeId = labels && labels.length > 0 ? labels[0].typeId : 1

      console.log('[create-bike] Using associationTypeId:', assocTypeId)

      const assocResponse = await axios.put(
        'https://api.hubapi.com/crm/v4/objects/2-145432491/' + bikeId + '/associations/contacts/' + contactId,
        [
          {
            associationCategory: 'HUBSPOT_DEFINED',
            associationTypeId: assocTypeId
          }
        ],
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + process.env.HUBSPOT_TOKEN
          }
        }
      )

      console.log('[create-bike] Association OK:', JSON.stringify(assocResponse.data, null, 2))

    } else {

      console.log('[create-bike] SKIPPING association - bikeId:', bikeId, '| contactId:', contactId)

    }

    return res.json({
      success: true,
      bikeId: bikeId,
      contactId: contactId
    })

  } catch (error) {

    console.log('[create-bike] ERROR status:', error.response?.status)
    console.log('[create-bike] ERROR data:', JSON.stringify(error.response?.data, null, 2))
    console.log('[create-bike] ERROR message:', error.message)

    return res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    })

  }

})

// UPDATE BIKE - STEP 3

app.post('/update-bike', async (req, res) => {

  try {

    const {
      bikeId,
      motorcycle_condition,
      do_you_have_the_keys_and_v5,
      do_you_know_how_much_you_are_looking_for_,
      when_are_you_looking_to_sell_your_bike,
      bike_owner_postal_code
    } = req.body

    if (!bikeId) {
      console.log('[update-bike] ERROR: bikeId is missing')
      return res.status(400).json({ success: false, error: 'bikeId is required' })
    }

    console.log('[update-bike] Updating bikeId:', bikeId)
    console.log('[update-bike] Properties:', {
      motorcycle_condition,
      do_you_have_the_keys_and_v5,
      do_you_know_how_much_you_are_looking_for_,
      when_are_you_looking_to_sell_your_bike,
      bike_owner_postal_code
    })

    const response = await axios.patch(
      'https://api.hubapi.com/crm/v3/objects/2-145432491/' + bikeId,
      {
        properties: {
          motorcycle_condition:                      motorcycle_condition,
          do_you_have_the_keys_and_v5:               do_you_have_the_keys_and_v5,
          do_you_know_how_much_you_are_looking_for_: do_you_know_how_much_you_are_looking_for_,
          when_are_you_looking_to_sell_your_bike:    when_are_you_looking_to_sell_your_bike,
          bike_owner_postal_code:                    bike_owner_postal_code
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + process.env.HUBSPOT_TOKEN
        }
      }
    )

    console.log('[update-bike] Success:', JSON.stringify(response.data, null, 2))

    return res.json({ success: true, data: response.data })

  } catch (error) {

    console.log('[update-bike] ERROR status:', error.response?.status)
    console.log('[update-bike] ERROR data:', JSON.stringify(error.response?.data, null, 2))

    return res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    })

  }

})

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log('Server running on port ' + PORT)
  console.log('HUBSPOT_TOKEN set:', !!process.env.HUBSPOT_TOKEN)
})