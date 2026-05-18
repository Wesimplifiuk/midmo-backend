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
const PORT =
  process.env.PORT || 3000

app.listen(PORT, () => {

  console.log(
    `Server running on ${PORT}`
  )

})