const express = require('express')
const cors = require('cors')
const axios = require('axios')

const app = express()

app.use(cors())
app.use(express.json())

app.get('/', (req, res) => {
  res.send('Bike API running')
})

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

    console.log(error.response?.data || error.message)

    return res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    })

  }

})

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`)
})