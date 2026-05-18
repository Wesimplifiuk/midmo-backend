app.post('/vehicle', async (req, res) => {

  try {

    const {
      registration
    } = req.body

    console.log(
      'SEARCHING VEHICLE:',
      registration
    )

    // VEHICLE DATA GLOBAL REQUEST

    const response = await axios.post(

      'YOUR-VEHICLE-ENDPOINT-HERE',

      {
        registrationNumber:
          registration
      },

      {
        headers: {

          'Content-Type':
            'application/json',

          Authorization:
            `Bearer ${process.env.VEHICLE_API_KEY}`

        }
      }

    )

    console.log(
      response.data
    )

    // MAP VEHICLE RESPONSE

    return res.json({

      success: true,

      vehicle: {

        make:
          response.data.make || '',

        model:
          response.data.model || '',

        variant:
          response.data.variant || '',

        year:
          response.data.year || '',

        engineSize:
          response.data.engineSize || '',

        colour:
          response.data.colour || ''

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