const express = require('express')
const cors = require('cors')
const axios = require('axios')

const app = express()

app.use(cors())
app.use(express.json())

app.get('/', (req, res) => {
  res.send('Bike API running')
})

// SEARCH CONTACT

app.post('/search-contact', async (req, res) => {

  try {

    const { email, firstname, lastname, phone } = req.body

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

    return res.json({
      success: true,
      hubspot: response.data
    })

  } catch (error) {

    console.log(JSON.stringify(error.response?.data, null, 2))

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
          auth_apikey:  '85F49083-9EB4-4C88-9C63-3DC40B79A30B',
          key_VRM:      registration,
          api_nullitems: 1
        }
      }
    )

    const data = vehicleResponse.data.Response.DataItems

    return res.json({
      success: true,
      vehicle: {
        make:       data.ClassificationDetails?.Smmt?.Make             || '',
        model:      data.ClassificationDetails?.Smmt?.Range            || '',
        variant:    data.SmmtDetails?.ModelVariant                     || '',
        year:       data.VehicleRegistration?.YearOfManufacture        || '',
        engineSize: data.VehicleRegistration?.EngineCapacity           || '',
        colour:     data.VehicleRegistration?.Colour                   || ''
      }
    })

  } catch (error) {

    console.log(JSON.stringify(error.response?.data, null, 2))

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

    // 1. SUBMIT FORM

    await axios.post(
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
      {
        headers: { 'Content-Type': 'application/json' }
      }
    )

    // 2. BUSCAR BIKE POR vehicle_registration

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

    const bikeResults = bikeSearch.data.results
    const bikeId = bikeResults && bikeResults.length > 0 ? bikeResults[0].id : null

    // 3. BUSCAR CONTACTO POR EMAIL

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

    const contactResults = contactSearch.data.results
    const contactId = contactResults && contactResults.length > 0 ? contactResults[0].id : null

    // 4. ASOCIAR BIKE CON CONTACTO

    if (bikeId && contactId) {

      await axios.put(
        'https://api.hubapi.com/crm/v4/objects/2-145432491/' + bikeId + '/associations/contacts/' + contactId,
        [
          {
            associationCategory: 'HUBSPOT_DEFINED',
            associationTypeId: 1
          }
        ],
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + process.env.HUBSPOT_TOKEN
          }
        }
      )

    }

    return res.json({
      success: true,
      bikeId: bikeId,
      contactId: contactId
    })

  } catch (error) {

    console.log(JSON.stringify(error.response?.data, null, 2))

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
      return res.status(400).json({ success: false, error: 'bikeId is required' })
    }

    console.log('[update-bike] Updating bikeId:', bikeId)

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

    console.log('[update-bike] ERROR:', JSON.stringify(error.response?.data, null, 2))
    console.log('[update-bike] ERROR status:', error.response?.status)

    return res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    })

  }

})

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log('Server running on port ' + PORT)
})