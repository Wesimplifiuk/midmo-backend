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

    const response =
      await axios.post(

        'https://api-eu1.hsforms.com/submissions/v3/integration/submit/26636031/f01310fa-918d-4909-9502-2f6f387d4212',

        {

          fields: [

            {
              name:
                'email',
              value:
                email
            },

            {
              name:
                'vehicle_registration',
              value:
                vehicle_registration
            },

            {
              name:
                'make',
              value:
                make
            },

            {
              name:
                'variant',
              value:
                variant
            },

            {
              name:
                'engine_size',
              value:
                engine_size
            },

            {
              name:
                'mileage',
              value:
                mileage
            },

            {
              name:
                'year',
              value:
                year
            },

            {
              name:
                'colour',
              value:
                colour
            },

            {
              name:
                'mot',

              value:
                Array.isArray(mot)
                  ? mot.join(';')
                  : mot
            }

          ],

          context: {

            pageUri:
              'https://thomasjamesbromley.wixstudio.com',

            pageName:
              'Bike Form'

          }

        },

        {
          headers: {
            'Content-Type':
              'application/json'
          }
        }

      )

    return res.json({

      success: true,
      response:
        response.data

    })

  } catch (error) {

    console.log(
      JSON.stringify(
        error.response?.data,
        null,
        2
      )
    )

    return res.status(500).json({

      success: false,

      error:
        error.response?.data ||
        error.message

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