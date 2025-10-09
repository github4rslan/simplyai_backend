import express from 'express';

const router = express.Router();

router.post('/register/facebook', async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Facebook registration endpoint working'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error'
    });
  }
});

export default router;
