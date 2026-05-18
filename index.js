const express = require('express')
const cors = require('cors')
const axios = require('axios')

const app = express()

app.use(cors())
app.use(express.json())

// ROOT

app.get('/', (req, res) => {

  res.send('Bike API running')

})

// SEARCH CONTACT

app.post('/search-contact', async (req, res) => {

  try {

    const {
      email,
      firstname,
      lastname,
      phone
    } = req.body

    const response = await axios.post(
      'https://api-eu1.hsforms.com/submissions/v3/integration/submit/26636031/f66ee250-4c4e-4666-8f1e-b8deefe3afab',
      {
        fields: [
          {
            name: 'email',
            value: email
          },
          {
            name: 'firstname',
            value: firstname
          },
          {
            name: 'lastname',
            value: lastname
          },
          {
            name: 'phone',
            value: phone
          }
        ],
        context: {
          pageUri: 'https://motortradeteam.com',
          pageName: 'Motorbike Lead Form'
        }
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )

    return res.json({
      success: true,
      hubspot: response.data
    })

  } catch (error) {

    console.log(
      error.response?.data ||
      error.message
    )

    return res.status(500).json({
      success: false,
      error:
        error.response?.data ||
        error.message
    })

  }

})

// VEHICLE ENDPOINT

// VEHICLE ENDPOINT

app.post('/vehicle', async (req, res) => {

  try {

    const {
      registration
    } = req.body

    console.log(
      'SEARCHING VEHICLE:',
      registration
    )

    const vehicleResponse =
      await axios.get(

        'https://uk1.ukvehicledata.co.uk/api/datapackage/VehicleData',

        {
          params: {

            auth_apikey:
              '85F49083-9EB4-4C88-9C63-3DC40B79A30B',

            key_VRM:
              registration,

            api_nullitems: 1

          }

        }

      )

    console.log(
      vehicleResponse.data
    )

    const data =
      vehicleResponse.data
        .Response
        .DataItems

    return res.json({

      success: true,

      vehicle: {

        make:
          data.VehicleRegistration?.Make || '',

        model:
          data.VehicleRegistration?.Model || '',

        variant:
          data.SmmtDetails?.ModelVariant || '',

        year:
          data.VehicleRegistration?.YearOfManufacture || '',

        engineSize:
          data.VehicleRegistration?.EngineCapacity || '',

        colour:
          data.VehicleRegistration?.Colour || '',

        fuelType:
          data.VehicleRegistration?.FuelType || '',

        transmission:
          data.VehicleRegistration?.Transmission || ''

      }

    })

  } catch (error) {

    console.log(
      error.response?.data ||
      error.message
    )

    return res.status(500).json({

      success: false,

      error:
        error.response?.data ||
        error.message

    })

  }

})


// CREATE BIKE + ASSOCIATE CONTACT

// CREATE BIKE + ASSOCIATE CONTACT

// CREATE BIKE FROM HUBSPOT FORM

// CREATE BIKE + BUSCAR SU ID

app.post('/create-bike', async (req, res) => {

  try {

    const {
      email,
      vehicle_registration,
      make,
      variant,
      engine_size,
      mileage,
      year,
      colour,
      mot
    } = req.body

    // 1. SUBMIT FORM (crea el objeto y lo asocia al contacto)

    await axios.post(
      'https://api-eu1.hsforms.com/submissions/v3/integration/submit/26636031/f01310fa-918d-4909-9502-2f6f387d4212',
      {
        fields: [
          { name: 'email', value: email },
          { name: '2-202877425/vehicle_registration', value: vehicle_registration },
          { name: '2-202877425/make', value: make },
          { name: '2-202877425/variant', value: variant },
          { name: '2-202877425/engine_size', value: engine_size },
          { name: '2-202877425/mileage', value: mileage ? String(mileage) : '0' },
          { name: '2-202877425/year', value: year },
          { name: '2-202877425/colour', value: colour },
          { name: '2-202877425/mot', value: Array.isArray(mot) ? mot.join(';') : mot }
        ],
        context: {
          pageUri: 'https://thomasjamesbromley.wixstudio.com',
          pageName: 'Bike Form'
        }
      },
      {
        headers: { 'Content-Type': 'application/json' }
      }
    )

    // 2. BUSCAR EL OBJETO RECIEN CREADO POR vehicle_registration

    const searchResponse = await axios.post(
      'https://api.hubapi.com/crm/v3/objects/2-202877425/search',
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
        sorts: [
          {
            propertyName: 'createdate',
            direction: 'DESCENDING'
          }
        ],
        limit: 1
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + process.env.HUBSPOT_API_KEY
        }
      }
    )

    const results = searchResponse.data.results

    const bikeId = results && results.length > 0
      ? results[0].id
      : null

    return res.json({
      success: true,
      bikeId: bikeId
    })

  } catch (error) {

    console.log(
      JSON.stringify(error.response?.data, null, 2)
    )

    return res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    })

  }

})


// UPDATE BIKE (STEP 3)

app.post('/update-bike', async (req, res) => {

  try {

    const {
      bikeId,
      motorcycle_condition,
      do_you_have_the_keys_,
      do_you_have_the_v5c_,
      do_you_know_how_much_you_are_looking_for_,
      when_are_you_looking_to_sell_your_bike,
      bike_owner_postal_code
    } = req.body

    const response = await axios.patch(
      'https://api.hubapi.com/crm/v3/objects/2-202877425/' + bikeId,
      {
        properties: {
          motorcycle_condition: motorcycle_condition,
          do_you_have_the_keys_: do_you_have_the_keys_,
          do_you_have_the_v5c_: do_you_have_the_v5c_,
          do_you_know_how_much_you_are_looking_for_: do_you_know_how_much_you_are_looking_for_,
          when_are_you_looking_to_sell_your_bike: when_are_you_looking_to_sell_your_bike,
          bike_owner_postal_code: bike_owner_postal_code
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + process.env.HUBSPOT_API_KEY
        }
      }
    )

    return res.json({
      success: true,
      data: response.data
    })

  } catch (error) {

    console.log(
      JSON.stringify(error.response?.data, null, 2)
    )

    return res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    })

  }

})



const PORT =
  process.env.PORT || 3000

app.listen(PORT, () => {

  console.log(
    `Server running on ${PORT}`
  )

})