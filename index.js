const express = require('express')
const cors = require('cors')
const axios = require('axios')

const app = express()

app.use(cors())
app.use(express.json())

app.get('/', (req, res) => {
  res.send('Bike API running')
})

app.get('/test-hubspot', async (req, res) => {

  try {

    const response = await axios.get(
      'https://api.hubapi.com/crm/v3/objects/contacts?limit=1',
      {
        headers: {
          Authorization: `Bearer ${process.env.HUBSPOT_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    )

    return res.json({
      success: true,
      data: response.data
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