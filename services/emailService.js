import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

// Create reusable transporter object using the default SMTP transport
const createTransporter = async () => {
    // For development, if no SMTP vars are set, use Ethereal
    if (!process.env.SMTP_HOST && process.env.NODE_ENV !== 'production') {
        const testAccount = await nodemailer.createTestAccount();
        console.log('Using Ethereal Mail for testing.');
        console.log('Ethereal User:', testAccount.user);
        console.log('Ethereal Pass:', testAccount.pass);

        return nodemailer.createTransport({
            host: "smtp.ethereal.email",
            port: 587,
            secure: false,
            auth: {
                user: testAccount.user,
                pass: testAccount.pass,
            },
        });
    }

    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });
};

let transporter = null;

export const sendEmail = async ({ to, subject, html }) => {
    try {
        if (!transporter) {
            transporter = await createTransporter();
        }

        const info = await transporter.sendMail({
            from: process.env.SMTP_FROM || '"My Blog App" <no-reply@blogapp.com>',
            to,
            subject,
            html,
        });

        console.log("Message sent: %s", info.messageId);

        // Preview only available when sending through an Ethereal account
        if (nodemailer.getTestMessageUrl(info)) {
            console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
        }

        return info;
    } catch (error) {
        console.error("Error sending email:", error);
        return null; // Don't throw to avoid crashing app flow
    }
};
